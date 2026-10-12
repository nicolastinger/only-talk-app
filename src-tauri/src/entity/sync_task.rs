use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

/// 任务类型: 正向追平(重连/登录轮)
pub const SYNC_KIND_FORWARD: i64 = 2;

/// 任务状态: 待执行(保留, 未用于正向追平)
pub const SYNC_STATUS_PENDING: i64 = 0;
/// 任务状态: 执行中(保留, 未用于正向追平)
pub const SYNC_STATUS_RUNNING: i64 = 1;
/// 任务状态: 成功
pub const SYNC_STATUS_SUCCESS: i64 = 2;
/// 任务状态: 失败
pub const SYNC_STATUS_FAILED: i64 = 3;

/// 会话追平记录表(正向追平): 每轮重连/登录 = 一批(`batch_id` = 触发时刻毫秒),
/// 每会话一条**终态**记录(成功/失败)。供前端 `get_sync_history` 查看
/// "哪个会话追平成功/失败"。非队列 —— 记录由正向追平流程同步写入终态。
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SyncTask {
    pub id: i64,
    pub batch_id: i64,
    pub session_uuid: String,
    pub kind: i64,
    pub status: i64,
    /// 本记录消化的拉取批次数
    pub batches: i64,
    /// 本记录累计新增消息数
    pub new_count: i64,
    /// 重试次数(失败时 1)
    pub attempt: i64,
    /// 失败原因(成功时 NULL)
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
