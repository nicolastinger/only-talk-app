use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

/// 任务类型: 静默补拉(重连轮)
pub const SYNC_KIND_GAP: i64 = 0;
/// 任务类型: 同意式回填
pub const SYNC_KIND_BACKFILL: i64 = 1;

/// 任务状态: 待执行
pub const SYNC_STATUS_PENDING: i64 = 0;
/// 任务状态: 执行中
pub const SYNC_STATUS_RUNNING: i64 = 1;
/// 任务状态: 成功
pub const SYNC_STATUS_SUCCESS: i64 = 2;
/// 任务状态: 失败
pub const SYNC_STATUS_FAILED: i64 = 3;

/// 同步域任务表(任务12 §4.6): 执行记录(批次 × 会话, append)。
///
/// `batch_id` = 触发时刻毫秒 —— 一次重连/一次同意回填 = 一批; 批的成败由
/// `GROUP BY batch_id` 派生(不存冗余计数, 避免漂移)。队列本体即任务行
/// (`kind=1, status in {0,1}`), 按 `id` 序领取。
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SyncTask {
    pub id: i64,
    pub batch_id: i64,
    pub session_uuid: String,
    pub kind: i64,
    pub status: i64,
    /// 本任务已消化拉取批次数
    pub batches: i64,
    /// 本任务累计新增消息数
    pub new_count: i64,
    /// 重试次数
    pub attempt: i64,
    /// 最近失败原因(成功时清空)
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl SqliteStore for SyncTask {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS sync_task (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id     INTEGER NOT NULL,
            session_uuid TEXT NOT NULL,
            kind         INTEGER NOT NULL,
            status       INTEGER NOT NULL DEFAULT 0,
            batches      INTEGER NOT NULL DEFAULT 0,
            new_count    INTEGER NOT NULL DEFAULT 0,
            attempt      INTEGER NOT NULL DEFAULT 0,
            last_error   TEXT DEFAULT NULL,
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_task_batch ON sync_task(batch_id)")
            .execute(pool_sqlite)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_task_pending ON sync_task(kind, status)")
            .execute(pool_sqlite)
            .await?;
        Ok(())
    }

    async fn update_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}

/// 批次视图(任务12 §6.1 `get_sync_history`): `GROUP BY batch_id` 派生的成败聚合。
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SyncBatchSummary {
    pub batch_id: i64,
    /// 该批任务总数
    pub total: i64,
    /// 成功数
    pub success: i64,
    /// 失败数
    pub failed: i64,
    /// 待执行 + 执行中
    pub pending: i64,
}
