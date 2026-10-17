use std::path::Path;

use anyhow::anyhow;
use log::info;
use serde::{Deserialize, Serialize};

use super::media::{
    ensure_within_size_limit, prepare_image_for_upload, upload_group_chat_file_server,
};
use super::send::send_msg;
use crate::dao::group_message_ack::insert_group_message_ack;
use crate::dao::session_db::{query_chat_session_by_user_db, update_chat_session_db};
use crate::models::entity::chat_record_raw::ChatRecordRaw;
use crate::models::entity::chat_session::ChatSession;
use crate::models::entity::group_message_ack::GroupMessageAck;
use crate::models::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::quic_core::center_service::text_msg_service::generate_text_msg_without_nano;
use crate::service::send_queue;
use crate::service::user_service::get_user_info;
use crate::utils::app_emit;
use crate::utils::global_static_str::MAX_FILE_UPLOAD_SIZE;
use crate::GLOBAL_QUIC_SERVER_LIST;

/// 发送群聊文本消息（简化版，无prev_id和锁机制，写入群消息 ack 表）
pub async fn send_group_text_msg_service(
    text_quic_msg: TextQuicMsgVo,
) -> Result<String, anyhow::Error> {
    let sender = get_user_info("uuid").await?;
    let timestamp = text_quic_msg.timestamp;
    let group_id = text_quic_msg.recv_user.clone();

    // 序列化群聊消息内容
    let group_text_raw =
        GroupTextRecord { text: text_quic_msg.raw.clone(), send_user: sender.clone() };
    let raw = group_text_raw.json_serialize()?;

    // 写入群消息 ack 表（等待 ack 回执后再插入 group_chat_record）
    let ack = GroupMessageAck {
        id: 0,
        nano_id: text_quic_msg.nano_id.clone(),
        local_nano_id: text_quic_msg.nano_id.clone(),
        group_uuid: group_id.clone(),
        send_user: sender.clone(),
        text_type: text_quic_msg.text_type,
        ack_status: 0,
        raw: raw.clone(),
        timestamp,
    };
    insert_group_message_ack(&ack).await?;

    // 更新会话列表
    update_group_session_after_send(
        &group_id,
        &raw,
        text_quic_msg.text_type,
        &text_quic_msg.nano_id,
        timestamp,
    )
    .await?;

    let raw_bytes: Vec<u8> = Vec::from(raw);
    let send_id = text_quic_msg.nano_id.clone();
    let test_msg = generate_text_msg_without_nano(
        text_quic_msg.text_type,
        raw_bytes,
        text_quic_msg.recv_user,
        sender,
        text_quic_msg.nano_id,
    )?;

    let conn = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").map(|c| c.conn.clone())
    };
    match conn {
        Some(conn) => send_msg(test_msg, &conn).await,
        None => {
            // 重连期间: 进入全局离线发送队列, 上线后自动补发; 手动断开(Idle)则报错
            if send_queue::should_queue_on_offline().await {
                send_queue::enqueue(send_id.clone(), test_msg).await;
                info!("[send_queue] QUIC 未连接，群消息进入离线发送队列: {}", send_id);
                Ok("已进入离线发送队列".to_string())
            } else {
                Err(anyhow!("QUIC连接未建立，请稍后重试"))
            }
        }
    }
}

/// 发送群聊消息后更新会话列表
async fn update_group_session_after_send(
    group_id: &str,
    last_message: &str,
    text_type: u16,
    nano_id: &str,
    timestamp: i64,
) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;

    // 查询现有会话
    let mut group_session = query_chat_session_by_user_db(&me, group_id).await?;

    if group_session.is_empty() {
        // 会话不存在，创建新会话
        let chat_session = ChatSession {
            id: 0,
            nano_id: nano_id.to_string(),
            timestamp,
            text_type,
            unread_count: 0,
            last_message: last_message.to_string(),
            recv_user: me.clone(),
            send_user: group_id.to_string(),
            session_type: 2,
            is_show: 1,
            is_top: 0,
            group_id: Some(group_id.to_string()),
            session_uuid: None,
            last_message_id: 0,
        };
        update_chat_session_db(&chat_session).await?;

        // 发送会话事件到前端
        let chat_session_event =
            ChatSessionEvent { r#type: 0, data: ChatSessionVo::from(chat_session) };
        let payload = serde_json::to_string(&chat_session_event)?;
        app_emit::emit("chat_session", payload)?;
    } else {
        // 更新现有会话
        let mut chat_session = group_session.remove(0);
        chat_session.last_message = last_message.to_string();
        chat_session.timestamp = timestamp;
        chat_session.text_type = text_type;
        chat_session.nano_id = nano_id.to_string();
        chat_session.unread_count = 0;

        update_chat_session_db(&chat_session).await?;

        // 发送会话事件到前端
        let chat_session_event =
            ChatSessionEvent { r#type: 0, data: ChatSessionVo::from(chat_session) };
        let payload = serde_json::to_string(&chat_session_event)?;
        app_emit::emit("chat_session", payload)?;
    }

    Ok(())
}

/// 发送群聊图片消息（简化版，无prev_id和锁机制）
pub async fn send_group_image_msg_service(
    text_quic_msg: TextQuicMsgVo,
) -> Result<(), anyhow::Error> {
    let sender = get_user_info("uuid").await?;
    let file_path = text_quic_msg.raw.clone();
    let nano_id = text_quic_msg.nano_id.clone();
    let file_name = Path::new(&file_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image")
        .to_string();

    // 0-3、大小校验 / 压缩 / 尺寸解析 / 大小读取(阻塞线程池, 避免卡住 UI 线程)
    let (upload_path, img_width, img_height, img_size) = {
        let file_path = file_path.clone();
        let nano_id = nano_id.clone();
        let file_name = file_name.clone();
        tokio::task::spawn_blocking(move || {
            prepare_image_for_upload(&file_path, &nano_id, &file_name)
        })
        .await
        .map_err(|e| anyhow!("群图片预处理线程异常: {}", e))??
    };

    // 4、上传图片到文件服务器（使用群聊专用接口, 流式 + 进度）
    let upload_data =
        upload_group_chat_file_server(&upload_path, &text_quic_msg.recv_user, &nano_id).await?;

    // 5、获取第一个 file_info 的 biz_id
    let file_info = upload_data.file_infos.first().ok_or(anyhow!("file_infos 为空"))?;
    let biz_id = file_info.biz_id.clone();

    // 6、组装 GroupImageRecord
    let group_image_record = GroupImageRecord {
        biz_id,
        file_name,
        img_width,
        img_height,
        img_size,
        send_user: sender.clone(),
    };

    let image_raw = group_image_record.json_serialize()?;

    // 7、创建新的 TextQuicMsgVo 用于发送
    let mut image_msg = text_quic_msg.clone();
    image_msg.raw = image_raw;

    // 8、调用 send_group_text_msg_service 发送消息（无锁）
    send_group_text_msg_service(image_msg).await?;

    Ok(())
}

/// 发送群聊文件消息（简化版，无prev_id和锁机制）
pub async fn send_group_file_msg_service(
    text_quic_msg: TextQuicMsgVo,
) -> Result<(), anyhow::Error> {
    let sender = get_user_info("uuid").await?;
    let file_path = text_quic_msg.raw.clone();
    let path = Path::new(&file_path);
    let nano_id = text_quic_msg.nano_id.clone();

    // 1、获取文件名和文件扩展名
    let file_name =
        path.file_name().and_then(|name| name.to_str()).unwrap_or("unknown").to_string();

    let file_type = path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_string();

    // 2、获取文件大小(含大小限制校验)
    let file_size = ensure_within_size_limit(&file_path, MAX_FILE_UPLOAD_SIZE, "文件")? as i64;

    // 3、上传文件到文件服务器（使用群聊专用接口, 流式 + 进度）
    let upload_data =
        upload_group_chat_file_server(&file_path, &text_quic_msg.recv_user, &nano_id).await?;

    // 4、获取第一个 file_info 的 biz_id
    let file_info = upload_data.file_infos.first().ok_or(anyhow!("file_infos 为空"))?;
    let biz_id = file_info.biz_id.clone();

    // 5、组装 GroupFileRecord
    let group_file_record =
        GroupFileRecord { biz_id, file_name, file_size, file_type, send_user: sender.clone() };

    let file_raw = group_file_record.json_serialize()?;

    // 6、创建新的 TextQuicMsgVo 用于发送
    let mut file_msg = text_quic_msg.clone();
    file_msg.raw = file_raw;

    // 7、调用 send_group_text_msg_service 发送消息（无锁）
    send_group_text_msg_service(file_msg).await?;

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GroupTextRecord {
    pub text: String,
    pub send_user: String,
}

impl ChatRecordRaw for GroupTextRecord {
    fn deserialize(data: &str) -> Result<Self, anyhow::Error> {
        let record: GroupTextRecord = serde_json::from_str(data)?;
        Ok(record)
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        Ok(serde_json::to_string(self)?)
    }

    fn set_prev_id(&mut self, _prev_id: String) {
        // 群聊消息不需要 prev_id
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GroupImageRecord {
    pub biz_id: String,
    pub file_name: String,
    pub img_width: i32,
    pub img_height: i32,
    pub img_size: i32,
    pub send_user: String,
}

impl ChatRecordRaw for GroupImageRecord {
    fn deserialize(data: &str) -> Result<Self, anyhow::Error> {
        let record: GroupImageRecord = serde_json::from_str(data)?;
        Ok(record)
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        Ok(serde_json::to_string(self)?)
    }

    fn set_prev_id(&mut self, _prev_id: String) {
        // 群聊消息不需要 prev_id
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GroupFileRecord {
    pub biz_id: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_type: String,
    pub send_user: String,
}

impl ChatRecordRaw for GroupFileRecord {
    fn deserialize(data: &str) -> Result<Self, anyhow::Error> {
        let record: GroupFileRecord = serde_json::from_str(data)?;
        Ok(record)
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        Ok(serde_json::to_string(self)?)
    }

    fn set_prev_id(&mut self, _prev_id: String) {
        // 群聊消息不需要 prev_id
    }
}
