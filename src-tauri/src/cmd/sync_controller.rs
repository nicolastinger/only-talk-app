use crate::service::user_service::{
    SyncBatchView, get_sync_history as service_get_sync_history,
};

/// 任务12: 会话追平记录历史(按轮次聚合 + 明细 —— 看哪些会话追平成功/失败)。
#[tauri::command]
pub async fn get_sync_history() -> Result<Vec<SyncBatchView>, String> {
    service_get_sync_history().await.map_err(|e| e.to_string())
}