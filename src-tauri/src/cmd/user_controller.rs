use std::collections::HashMap;

use crate::GLOBAL_QUIC_USER_INFO;

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
