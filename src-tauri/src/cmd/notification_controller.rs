use crate::entity::system_notification::SystemNotification;
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
