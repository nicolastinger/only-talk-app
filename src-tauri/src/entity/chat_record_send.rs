use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatRecordSend {
    pub id: i64,
    pub send_id: String,      // 发送id
    pub msg_id: String,       // 消息id
    pub text_type: u16,       // 消息类型
    pub platform: u8,     // 平台
    pub recv_user: String,    // 接收用户
    pub send_user: String,    // 发送用户
    pub timestamp: i64,       // 消息时间戳, 超过1分钟未确认，则标记为失败
    pub raw: String,           // 消息内容
    pub send_status: u16,     // 0-未发送，1-发送中，2-发送失败，3-发送成功
    pub retry_count: i32,     // 重试次数, 超过3次则标记为失败
}

impl SqliteStore for ChatRecordSend {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS chat_record_send (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            send_id TEXT NOT NULL,
            msg_id TEXT NOT NULL,
            platform INTEGER NOT NULL,
            text_type INTEGER NOT NULL DEFAULT 0,
            recv_user TEXT NOT NULL,
            send_user TEXT NOT NULL,
            raw TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_status INTEGER NOT NULL DEFAULT 0,
            retry_count INTEGER NOT NULL DEFAULT 0
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
