use crate::service::chat_service::{
    clear_all_unread_sessions_service, create_chat_session_service, get_chat_session_service,
    hide_chat_session_service, search_chat_session_service, update_last_read_msg_service,
};
use crate::utils::session_uuid::single_session_uuid;
use crate::vo::chat_session_vo::ChatSessionVo;

/// 计算单聊会话标识(与服务端 v5 派生算法一致, 供前端做会话 key / 跳转参数)。
#[tauri::command]
pub fn session_uuid_cmd(a: String, b: String) -> Result<String, String> {
    let a = uuid::Uuid::parse_str(&a).map_err(|e| format!("非法 uuid a: {}", e))?;
    let b = uuid::Uuid::parse_str(&b).map_err(|e| format!("非法 uuid b: {}", e))?;
    Ok(single_session_uuid(&a, &b).to_string())
}

/// 已读当前会话
#[tauri::command]
pub async fn mark_read_chat_session(friend_uuid: String) -> Result<(), String> {
    update_last_read_msg_service(friend_uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 隐藏会话（is_show置0），新消息到达时自动重新显示
#[tauri::command]
pub async fn hide_chat_session(send_user: String, recv_user: String) -> Result<(), String> {
    hide_chat_session_service(send_user, recv_user).await.map_err(|e| e.to_string())
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

/// 模糊搜索会话列表
#[tauri::command]
pub async fn search_chat_session(keyword: String) -> Result<Vec<ChatSessionVo>, String> {
    search_chat_session_service(keyword).await.map_err(|e| e.to_string())
}
