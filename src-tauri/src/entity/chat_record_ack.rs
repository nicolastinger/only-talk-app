use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatRecordAck {
    pub id: i64,
    pub msg_id: String,    // 消息id
    pub prev_id: String,   // 上一条消息id
    pub send_id: String,   // 发送id
    pub platform: u8,      // 平台
    pub ack_status: u16,   // 0: 未确认, 1: 已确认
    pub recv_user: String, // 接收用户
    pub send_user: String, // 发送用户
    pub timestamp: i64,    // 消息时间戳
}

impl SqliteStore for ChatRecordAck {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS chat_record_ack (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_id TEXT NOT NULL,
            prev_id TEXT NOT NULL,
            send_id TEXT NOT NULL,
            platform INTEGER NOT NULL,
            ack_status INTEGER NOT NULL DEFAULT 0,
            recv_user TEXT NOT NULL,
            send_user TEXT NOT NULL,
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
