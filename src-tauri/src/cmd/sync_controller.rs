use crate::service::user_service::{
    BackfillState, SyncBatchView, enqueue_backfill,
    get_backfill_state as service_get_backfill_state, get_sync_history as service_get_sync_history,
};

/// 任务12: 同意式回填 —— 入队(建批 + 任务行), 立即返回, 执行交后台 worker。
#[tauri::command]
pub async fn backfill_session(session_uuid: String) -> Result<(), String> {
    enqueue_backfill(&session_uuid).await.map_err(|e| e.to_string())
}

/// 任务12: 进会话提示状态(是否应弹「同步最近 7 天」/ 是否进行中)。
#[tauri::command]
pub async fn get_backfill_state(session_uuid: String) -> Result<BackfillState, String> {
    service_get_backfill_state(&session_uuid).await.map_err(|e| e.to_string())
}

/// 任务12: 批次视图(一次触发一批, 含批内任务明细)。
#[tauri::command]
pub async fn get_sync_history() -> Result<Vec<SyncBatchView>, String> {
    service_get_sync_history().await.map_err(|e| e.to_string())
}
