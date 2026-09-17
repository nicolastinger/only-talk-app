use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

/// 回填完成态: 未回填过(需提示)
pub const BACKFILL_NONE: i64 = 0;
/// 回填完成态: 已完成(不再提示)
pub const BACKFILL_DONE: i64 = 1;
/// 回填完成态: 跳过(「不再提示」, 不拉取)
pub const BACKFILL_SKIPPED: i64 = 2;

/// 同步域水位表(任务12 §4.6): 每会话一行的持久状态。
///
/// - `synced_id`: 前沿 —— 已回报的最大服务端 id(Kafka: 已提交位移);
/// - `hist_floor`: 连续前沿 —— 一切 `id >= hist_floor` 的消息都在本地; NULL = 尚未建立;
/// - `backfill`: 提示抑制的持久位(0 未回填 / 1 完成 / 2 跳过)。
///
/// 本表**不随批次清理**(任务表 `sync_task` 才按批保留), 故与任务表分表。
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SessionSyncState {
    pub session_uuid: String,
    pub synced_id: i64,
    pub hist_floor: Option<i64>,
    pub backfill: i64,
    pub updated_at: i64,
}

impl SqliteStore for SessionSyncState {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS session_sync_state (
            session_uuid TEXT PRIMARY KEY,
            synced_id    INTEGER NOT NULL DEFAULT 0,
            hist_floor   INTEGER DEFAULT NULL,
            backfill     INTEGER NOT NULL DEFAULT 0,
            updated_at   INTEGER NOT NULL
        )"#,
        )
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
