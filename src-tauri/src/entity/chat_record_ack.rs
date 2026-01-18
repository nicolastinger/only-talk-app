use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatRecordAck {
    pub id: i64,
    pub nano_id: String,
    pub text_type: u16,    //消息类型
    pub raw: String,       //数据
    pub recv_user: String, //接收用户
    pub send_user: String, //发送用户
    pub timestamp: i64,
}

impl SqliteStore for ChatRecordAck {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS chat_record_ack (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            raw TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
            text_type INTEGER NOT NULL DEFAULT 0
        )"#,
        )
            .execute(pool_sqlite)
            .await?;
        Ok(())
    }

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }

    async fn drop_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}