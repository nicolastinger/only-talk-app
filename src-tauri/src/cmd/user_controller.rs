use std::collections::HashMap;

use crate::GLOBAL_QUIC_USER_INFO;
use crate::service::user_service::{disconnect_quic, reconnect_quic};

/// 增加持久化数据
#[tauri::command]
pub async fn add_user_map(map: HashMap<String, String>) -> Result<String, String> {
    GLOBAL_QUIC_USER_INFO.write().await.extend(map.into_iter());
    Ok("success".to_string())
}

/// 获取持久化数据
#[tauri::command]
pub async fn get_user_map(key: String) -> Result<String, String> {
    Ok(GLOBAL_QUIC_USER_INFO.read().await.get(&key).cloned().ok_or("not found")?.to_string())
}

/// 断开QUIC连接
/// 清理所有与服务器连接的QUIC资源
#[tauri::command]
pub async fn disconnect_quic_command() -> Result<String, String> {
    disconnect_quic().await.map_err(|e| e.to_string())?;
    Ok("QUIC连接已断开".to_string())
}

/// 重新连接QUIC服务
/// 重新建立与服务器连接的QUIC资源
#[tauri::command]
pub async fn reconnect_quic_command() -> Result<String, String> {
    reconnect_quic().await.map_err(|e| e.to_string())?;
    Ok("QUIC重连请求已发送".to_string())
}
