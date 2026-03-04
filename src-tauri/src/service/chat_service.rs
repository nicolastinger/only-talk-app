use std::sync::Arc;

use anyhow::anyhow;
use log::{error, info};
use quinn::SendStream;
use tauri::Emitter;
use tokio::sync::RwLock;

use crate::dao::chat_record_db::{query_last_chat_record};
use crate::dao::session_db::{
    query_chat_session_by_user_db, query_chat_session_db, update_chat_session_db,
    update_chat_session_local_db,
};
use crate::entity::chat_record::ChatRecord;
use crate::entity::chat_record_read::ChatRecordRead;
use crate::entity::chat_session::ChatSession;
use crate::service::user_service::{get_user_info, get_user_map};
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{APP_HANDLE, GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};
use crate::dao::chat_record_ack::{insert_chat_record_ack, query_chat_record_by_send_id};
use crate::dao::chat_record_read::update_last_read_msg;
use crate::dao::chat_record_send::{insert_chat_record_send, query_chat_record_send_by_user, update_chat_record_send};
use crate::entity::chat_record_ack::ChatRecordAck;
use crate::entity::chat_record_raw::{ChatRecordRaw, ImageRecord, TextRecord};
use crate::entity::chat_record_send::ChatRecordSend;
use crate::quic_service::center_service::text_msg_service::generate_text_msg_without_nano;
use crate::utils::global_static_str::{PLATFORM, ZERO_UUID};

/// 获取会话列表
pub async fn get_chat_session_service() -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let uuid =
        GLOBAL_QUIC_USER_INFO.read().await.get("uuid").cloned().ok_or(anyhow!("获取失败"))?;
    query_chat_session_db(&uuid).await
}

/// 本地清空已读消息计数
pub async fn clear_chat_session(chat_session: ChatSession) -> Result<(), anyhow::Error> {
    update_chat_session_local_db(&chat_session).await?;

    //发送会话消息给前端
    let chat_session_event =
        ChatSessionEvent { r#type: 0, data: ChatSessionVo::from(chat_session)? };
    let payload = serde_json::to_string(&chat_session_event)?;
    {
        APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("chat_session", payload)?;
    }
    Ok(())
}

/// 发送文本信息,最小作用范围
pub async fn send_msg(
    text_msg: Vec<u8>,
    send_stream: Arc<RwLock<SendStream>>,
) -> Result<String, anyhow::Error> {
    send_stream.write().await.write_all(&text_msg).await?;
    Ok("success".to_string())
}

/// 已读目标用户的所有聊天消息
pub async fn update_last_read_msg_service(friend_uuid: String) -> Result<(), anyhow::Error> {
    let me = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;
    // 获取目标用户最新一条聊天消息
    let last_msg = query_last_chat_record(&me, &friend_uuid).await?;
    if last_msg.is_none() {
        return Ok(());
    }
    let last_msg = last_msg.ok_or(anyhow!("获取失败"))?;
    info!("最新消息: {}", last_msg.nano_id);
    // 获取目标用户的会话
    let mut chat_session = query_chat_session_by_user_db(&me, &friend_uuid).await?;
    if chat_session.is_empty() {
        let friend_uuid_clone = friend_uuid.clone();
        create_chat_session_service(friend_uuid_clone).await?;
        chat_session = query_chat_session_by_user_db(&me, &friend_uuid).await?;
    }
    let last_chat_session = match chat_session.len() {
        0 => {
            error!("获取会话失败，新建会话失败！");
            return Ok(());
        }
        1 => chat_session.remove(0),
        _ => {
            error!("获取会话失败，超出会话限制！");
            info!("开始删除旧会话...");
            // TODO: 删除旧会话，获取最新会话
            chat_session.remove(0)
        }
    };

    info!("最新聊天消息: {}，最新会话消息: {}", last_msg.nano_id, last_chat_session.nano_id);
    // 如果会话已存在，则不处理
    if last_chat_session.nano_id == last_msg.nano_id && last_chat_session.unread_count == 0 {
        return Ok(());
    }
    //发送会话消息给前端
    let chat_session = ChatSession {
        id: 0,
        nano_id: last_msg.nano_id,
        timestamp: last_msg.timestamp,
        text_type: last_msg.text_type,
        unread_count: 0,
        last_message: last_msg.raw,
        recv_user: me,
        send_user: friend_uuid,
        session_type: last_chat_session.session_type,
        is_show: last_chat_session.is_show,
        is_top: last_chat_session.is_top,
    };
    clear_chat_session(chat_session).await?;
    Ok(())
}

/// 更新已读消息
pub async fn update_last_read_msg_from_db(
    last_msg_vec: Vec<TextQuicMsgVo>,
) -> Result<(), anyhow::Error> {
    let uuid = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;
    // 遍历更新，根据发送端和接收时间进行判断去重
    // 使用HashMap去重，key为(发送者, 接收者)，value为最新的消息
    let mut unique_msgs: std::collections::HashMap<(String, String), TextQuicMsgVo> =
        std::collections::HashMap::new();

    for item in last_msg_vec {
        let key = (
            match item.send_user == uuid {
                true => item.recv_user.clone(),
                false => item.send_user.clone(),
            },
            uuid.clone(),
        );

        // 如果已经存在这个发送者-接收者的组合，只保留时间戳更新的
        if let Some(existing_item) = unique_msgs.get(&key) {
            if item.timestamp > existing_item.timestamp {
                unique_msgs.insert(key, item);
            }
        } else {
            unique_msgs.insert(key, item);
        }
    }

    // 遍历去重后的消息进行处理
    for (_, item) in unique_msgs {
        let chat_record_read = ChatRecordRead {
            id: 0,
            nano_id: item.nano_id.clone(),
            timestamp: item.timestamp,
            recv_user: uuid.clone(),
            send_user: match item.send_user == uuid {
                true => item.recv_user.clone(),
                false => item.send_user.clone(),
            },
        };
        update_last_read_msg(&chat_record_read).await?;

        //发送会话消息给前端
        let chat_session = ChatSession {
            id: 0,
            nano_id: chat_record_read.nano_id,
            timestamp: item.timestamp,
            text_type: item.text_type,
            unread_count: 0,
            last_message: item.raw,
            recv_user: item.recv_user,
            send_user: item.send_user,
            session_type: 0,
            is_show: 1,
            is_top: 0,
        };
        clear_chat_session(chat_session).await?;
    }
    Ok(())
}

/// 创建会话窗口
pub async fn create_chat_session_service(friend_uuid: String) -> Result<(), anyhow::Error> {
    // 获取当前用户
    let me = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;

    // 查询聊天记录
    let chat_record_count =
        ChatRecord::query_chat_record_count_by_friend(&me, &friend_uuid).await?;

    // 查询是否存在会话
    let chat_session = query_chat_session_db(&me).await?;
    for mut item in chat_session {
        if item.send_user == friend_uuid {
            // 存在会话
            item.is_show = 1;
            let chat_session = ChatSession::from(item)?;
            update_chat_session_local_db(&chat_session).await?;
            return Ok(());
        }
    }
    let chat_session = ChatSession {
        id: 0,
        nano_id: nanoid::nanoid!(),
        timestamp: get_now_time_stamp_as_millis()?,
        text_type: 0,
        unread_count: chat_record_count as i64,
        last_message: "".to_string(),
        recv_user: me,
        send_user: friend_uuid,
        session_type: 1,
        is_show: 1,
        is_top: 0,
    };
    // 创建会话窗口
    update_chat_session_db(&chat_session).await?;
    Ok(())
}


/// 发送文本消息
pub async fn send_text_msg_service(text_quic_msg: TextQuicMsgVo) -> Result<String, anyhow::Error> {
    let sender = get_user_info("uuid").await?;
    let now = get_now_time_stamp_as_millis()?;

    let msg = text_quic_msg.raw;
    let mut prev_id = ZERO_UUID.to_string();

    // 查询本地最新一条已发送成功的消息
    let last_send_success_msg = query_chat_record_send_by_user(&sender, &text_quic_msg.recv_user, vec![3]).await?;
    if !last_send_success_msg.is_empty() {
        let send_id = &last_send_success_msg.first().ok_or(anyhow!("last_send_success_msg is empty"))?.send_id;
        let prev_ack = query_chat_record_by_send_id(send_id, &text_quic_msg.recv_user).await?;
        prev_id = prev_ack.prev_id;
    }
    
    let prev_id_clone = prev_id.clone();
    
    let msg_raw = set_prev_id(&msg, text_quic_msg.text_type, prev_id)?;

    let mut chat_record_send = ChatRecordSend {
        id: 0,
        send_id: text_quic_msg.nano_id.clone(),
        msg_id: "".to_string(),
        text_type: text_quic_msg.text_type,
        platform: PLATFORM.to_string(),
        recv_user: text_quic_msg.recv_user,
        send_user: sender,
        timestamp: now,
        raw: msg_raw,
        send_status: 1,
        retry_count: 0,
    };

    // 检查当前接收用户，本地是否有未发送完成的消息
    let no_send_success_msg = query_chat_record_send_by_user(&chat_record_send.send_user, &chat_record_send.recv_user, vec![0, 1]).await?;
    // 如果有，直接插入到本地发送表中，等待回调ack后发送或者定时任务检查发送
    if !no_send_success_msg.is_empty() {
        chat_record_send.send_status = 0;
        insert_chat_record_send(&chat_record_send).await?;
        return Ok("插入等待队列".to_string());
    }

    insert_chat_record_send(&chat_record_send).await?;
    let chat_record_ack = ChatRecordAck {
        id: 0,
        msg_id: "".to_string(),
        prev_id: prev_id_clone,
        send_id: chat_record_send.send_id,
        platform: chat_record_send.platform,
        ack_status: 0,
        recv_user: chat_record_send.recv_user,
        send_user: chat_record_send.send_user,
        timestamp: now,
    };
    insert_chat_record_ack(&chat_record_ack).await?;
    

    // 如果没有，则直接发送消息
    let raw: Vec<u8> = Vec::from(chat_record_send.raw);
    let test_msg = generate_text_msg_without_nano(
        text_quic_msg.text_type,
        raw,
        chat_record_ack.recv_user,
        chat_record_ack.send_user,
        chat_record_ack.send_id
    )?;
    let send_stream = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").expect("SERVER_TEXT not found").send_stream.clone()
    };

    send_msg(test_msg, send_stream).await
}

// 设置消息prev_id
pub fn set_prev_id(raw: &str, text_type: u16, prev_id: String) -> Result<String, anyhow::Error> {
    match text_type {
        1 => {
            let mut chat_record_raw = TextRecord::deserialize(raw)?;
            chat_record_raw.set_prev_id(prev_id);
            chat_record_raw.json_serialize()
        },
        2 => {
            let mut chat_record_raw = ImageRecord::deserialize(raw)?;
            chat_record_raw.set_prev_id(prev_id);
            chat_record_raw.json_serialize()
        },
        _ => Err(anyhow!("不支持的消息类型: {}", text_type))
    }
}

// 处理本地未发送完成的消息
pub async fn process_no_send_success_msg() -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let recv_user = String::from("");
    let no_send_success_msg = query_chat_record_send_by_user(&me, &recv_user, vec![0, 1]).await?;
    let now = get_now_time_stamp_as_millis()?;
    if !no_send_success_msg.is_empty() {
        let mut no_send_success_msg_option: Option<ChatRecordSend> = None;
        for mut item in no_send_success_msg {
            let status = item.send_status;
            let retry_count = item.retry_count;
            let timestamp = item.timestamp;
            let diff_time = now - timestamp;
            if status == 0 && no_send_success_msg_option.is_none() {
                no_send_success_msg_option = Some(item);
                continue;
            }
            if status == 1 && no_send_success_msg_option.is_none() && retry_count < 3 && diff_time > 8000{
                no_send_success_msg_option = Some(item);
                continue;
            }
            if status == 1 && retry_count >= 3 {
                item.send_status = 2;
                update_chat_record_send(&item.send_id, "", 2, 3, now).await?;
            }
        }
        if let Some(item) = no_send_success_msg_option {
            info!("存在未发送完成的消息, 发送消息: {}", item.send_id);
            let retry_count = item.retry_count + 1;
            // 更新消息状态为发送中
            update_chat_record_send(&item.send_id, "", 1, retry_count, now).await?;

            let raw: Vec<u8> = Vec::from(item.raw);
            let test_msg = generate_text_msg_without_nano(
                item.text_type,
                raw,
                item.recv_user,
                item.send_user,
                item.send_id
            )?;
            let send_stream = {
                let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
                server_book.get("SERVER_TEXT").expect("SERVER_TEXT not found").send_stream.clone()
            };

            send_msg(test_msg, send_stream).await?;
        }
    }

    Ok(())
}