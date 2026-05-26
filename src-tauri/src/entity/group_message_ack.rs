use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct GroupMessageAck {
    pub id: i64,
    pub nano_id: String,      // 消息 nano_id
    pub group_uuid: String,   // 群组 UUID
    pub send_user: String,    // 发送者 UUID
    pub ack_status: u16,      // 0: 未确认, 1: 已确认
    pub timestamp: i64,       // 消息时间戳
}

impl SqliteStore for GroupMessageAck {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS group_message_ack (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL UNIQUE,
            group_uuid TEXT NOT NULL,
            send_user TEXT NOT NULL,
            ack_status INTEGER NOT NULL DEFAULT 0,
            timestamp INTEGER NOT NULL
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