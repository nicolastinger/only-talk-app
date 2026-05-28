use std::time::Duration;

use log::error;
use tokio::time::timeout;

use crate::dao::chat_record_db::query_chat_record_by_id_from_db;
use crate::entity::Page;
use crate::service::chat_service::{
    get_chat_record_by_type_service, get_chat_record_service, get_group_chat_record_service,
    send_file_msg_service, send_group_file_msg_service, send_group_image_msg_service,
    send_group_text_msg_service, send_image_msg_service, send_text_msg_service,
    update_last_read_msg_from_db, update_group_last_read_msg_service,
};
use crate::service::user_service::get_user_info;
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::GLOBAL_MSG_SEND_LOCK;

/// 发送文本消息
#[tauri::command]
pub async fn send_text_msg(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    // 获取全局消息发送锁，保证数据库最新消息，超过10秒后获取不到锁就返回错误
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        let res = send_text_msg_service(text_quic_msg).await;
        res
    })
    .await;
    match result {
        Ok(Ok(_)) => Ok("success".to_string()),
        Ok(Err(e)) => {
            error!("获取锁时发生意外错误,{}", e);
            Err(e.to_string())
        }
        Err(elapsed) => {
            error!("超时：10秒内未能获取锁 {}", elapsed);
            Err("获取锁超时".to_string())
        }
    }
}

/// 发送群聊文本消息（无锁机制）
#[tauri::command]
pub async fn send_group_text_msg(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    send_group_text_msg_service(text_quic_msg)
        .await
        .map_err(|e| e.to_string())
}

/// 发送群聊图片消息（无锁机制）
#[tauri::command]
pub async fn send_group_image_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_group_image_msg_service(text_quic_msg)
        .await
        .map_err(|e| e.to_string())
}

/// 发送群聊文件消息（无锁机制）
#[tauri::command]
pub async fn send_group_file_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_group_file_msg_service(text_quic_msg)
        .await
        .map_err(|e| e.to_string())
}

// 发送图片数据
#[tauri::command]
pub async fn send_image_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_image_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

// 发送文件数据
#[tauri::command]
pub async fn send_file_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_file_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

/// 已读当前记录
#[tauri::command]
pub async fn mark_read(text_quic_msg_vec: Vec<String>) -> Result<(), String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let mut last_msg_vec: Vec<TextQuicMsgVo> = vec![];
    for item in text_quic_msg_vec {
        let text_quic_msg =
            query_chat_record_by_id_from_db(&item, &me).await.map_err(|e| e.to_string())?;
        last_msg_vec.push(text_quic_msg);
    }

    update_last_read_msg_from_db(last_msg_vec).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取本地的聊天数据
#[tauri::command]
pub async fn get_chat_record_from_store(
    text_quic_msg: TextQuicMsgVo,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, String> {
    get_chat_record_service(text_quic_msg, page).await.map_err(|e| e.to_string())
}

/// 按消息类型获取本地的聊天数据（用于图片预览等场景）
#[tauri::command]
pub async fn get_chat_record_by_type(
    text_quic_msg: TextQuicMsgVo,
    text_type: u16,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, String> {
    get_chat_record_by_type_service(text_quic_msg, text_type, page).await.map_err(|e| e.to_string())
}

/// 获取群聊的本地聊天数据
#[tauri::command]
pub async fn get_group_chat_record_from_store(
    group_id: String,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, String> {
    get_group_chat_record_service(group_id, page).await.map_err(|e| e.to_string())
}

/// 群消息已读
#[tauri::command]
pub async fn mark_group_read(
    group_uuid: String,
    nano_id: String,
    timestamp: i64,
) -> Result<(), String> {
    update_group_last_read_msg_service(group_uuid, nano_id, timestamp)
        .await
        .map_err(|e| e.to_string())
}
