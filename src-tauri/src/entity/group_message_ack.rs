use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct GroupMessageAck {
    pub id: i64,
    pub nano_id: String,        // 消息 nano_id
    pub local_nano_id: String,  // 本机生成的 nano_id，用于 ack 查找回执
    pub group_uuid: String,     // 群组 UUID
    pub send_user: String,      // 发送者 UUID
    pub text_type: u16,         // 消息类型
    pub ack_status: u16,        // 0: 未确认, 1: 已确认
    pub raw: String,            // 消息原始内容，ack 成功后用于插入群聊记录
    pub timestamp: i64,         // 消息时间戳
}

impl SqliteStore for GroupMessageAck {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS group_message_ack (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL UNIQUE,
            local_nano_id TEXT NOT NULL,
            group_uuid TEXT NOT NULL,
            send_user TEXT NOT NULL,
            text_type INTEGER NOT NULL DEFAULT 0,
            ack_status INTEGER NOT NULL DEFAULT 0,
            raw TEXT NOT NULL,
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