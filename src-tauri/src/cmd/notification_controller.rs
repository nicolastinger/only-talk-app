use crate::entity::system_notification::{SystemNotification, UnreadCounts};
use crate::service::user_service::get_user_info;

/// 获取系统通知信息
#[tauri::command]
pub async fn get_system_notification(
    is_read: Option<i32>,
) -> Result<Vec<SystemNotification>, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let res =
        SystemNotification::find_all_by_is_read(&me, is_read).await.map_err(|e| e.to_string())?;
    Ok(res)
}

/// 已读系统通知信息
#[tauri::command]
pub async fn batch_read_system_notification(read_ids: Vec<String>) -> Result<i32, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let res = SystemNotification::batch_read(&me, read_ids).await.map_err(|e| e.to_string())?;
    Ok(res)
}

/// 一键清空所有未读通知
#[tauri::command]
pub async fn clear_all_unread_notifications() -> Result<(), String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    SystemNotification::clear_all_unread(&me).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 按层级条件批量清除未读通知
/// level 参数传 -1 表示通配该层级所有值
#[tauri::command]
pub async fn clear_unread_by_level(
    level1: i32,
    level2: i32,
    level3: i32,
    level4: i32,
) -> Result<i32, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let res = SystemNotification::clear_unread_by_level(&me, level1, level2, level3, level4)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res)
}

/// 查询各模块未读通知数量（从 SQLite 实时查询）
#[tauri::command]
pub async fn get_unread_notification_counts() -> Result<UnreadCounts, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    SystemNotification::get_unread_counts(&me).await.map_err(|e| e.to_string())
}
