use crate::service::chat_service::{
    clear_all_unread_sessions_service, create_chat_session_service, get_chat_session_service,
    update_last_read_msg_service,
};
use crate::vo::chat_session_vo::ChatSessionVo;

/// 已读当前会话
#[tauri::command]
pub async fn mark_read_chat_session(friend_uuid: String) -> Result<(), String> {
    update_last_read_msg_service(friend_uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 创建一个聊天窗口
#[tauri::command]
pub async fn create_chat_session(friend_uuid: String) -> Result<(), String> {
    create_chat_session_service(friend_uuid).await.map_err(|e| e.to_string())
}

/// 获取会话列表
#[tauri::command]
pub async fn get_chat_session_from_store() -> Result<Vec<ChatSessionVo>, String> {
    get_chat_session_service().await.map_err(|e| e.to_string())
}

/// 一键清空所有未读会话
#[tauri::command]
pub async fn clear_all_unread_sessions() -> Result<(), String> {
    clear_all_unread_sessions_service().await.map_err(|e| e.to_string())
}
