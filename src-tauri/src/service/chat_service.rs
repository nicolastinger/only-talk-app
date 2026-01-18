use crate::cmd::api_controller::get_user_map;
use crate::entity::chat_record_read::ChatRecordRead;
use crate::entity::chat_session::ChatSession;
use crate::dao::chat_record_db::{
     query_last_chat_record, update_last_read_msg,
};
use crate::dao::session_db::{
    query_chat_session_by_user_db, query_chat_session_db, update_chat_session_db,
    update_chat_session_local_db,
};
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO, GLOBAL_SQL_POOL};
use anyhow::anyhow;
use log::{error, info};
use quinn::SendStream;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::RwLock;
use crate::entity::chat_record::ChatRecord;

/// 获取会话列表
pub async fn get_chat_session_service() -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let uuid = GLOBAL_QUIC_USER_INFO
        .read()
        .await
        .get("uuid")
        .cloned()
        .ok_or(anyhow!("获取失败"))?;
    Ok(query_chat_session_db(&uuid).await?)
}

/// 本地清空已读消息计数
pub async fn clear_chat_session(chat_session: ChatSession) -> Result<(), anyhow::Error> {
    update_chat_session_local_db(&chat_session).await?;

    //发送会话消息给前端
    let chat_session_event = ChatSessionEvent {
        r#type: 0,
        data: ChatSessionVo::from(chat_session)?,
    };
    let payload = serde_json::to_string(&chat_session_event)?;
    {
        APP_HANDLE
            .get()
            .ok_or(anyhow!("获取app失败"))?
            .emit("chat_session", payload)?;
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
    let me = get_user_map("uuid".to_string())
        .await
        .map_err(|e| anyhow!(e))?;
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

    info!(
        "最新聊天消息: {}，最新会话消息: {}",
        last_msg.nano_id, last_chat_session.nano_id
    );
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
    let uuid = get_user_map("uuid".to_string())
        .await
        .map_err(|e| anyhow!(e))?;
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
    let me = get_user_map("uuid".to_string())
        .await
        .map_err(|e| anyhow!(e))?;

    // 查询聊天记录
    let chat_record_count = ChatRecord::query_chat_record_count_by_friend(&me, &friend_uuid).await?;

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
