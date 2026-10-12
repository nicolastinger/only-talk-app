use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

/// 会话类型: 单聊
pub const CHAT_TYPE_SINGLE: u32 = 1;
/// 会话类型: 群聊
pub const CHAT_TYPE_GROUP: u32 = 2;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatRecordRead {
    pub id: i64,
    pub nano_id: String,
    pub timestamp: i64,
    pub recv_user: String,
    pub send_user: String,
}

impl SqliteStore for ChatRecordRead {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS chat_record_read (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
            reported_nano_id TEXT NOT NULL DEFAULT '',
            reported_timestamp INTEGER NOT NULL DEFAULT 0,
            UNIQUE(send_user, recv_user)
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        // 迁移：补充已读上报 nano_id 列(老库无此列, SQLite 不支持 ADD COLUMN IF NOT EXISTS)
        let _ = sqlx::query(
            r#"ALTER TABLE chat_record_read ADD COLUMN reported_nano_id TEXT NOT NULL DEFAULT ''"#,
        )
        .execute(pool_sqlite)
        .await; // 列已存在则忽略
                // 迁移：补充已读上报时间戳列(用于"只推时间戳更新位置"的推进校验)
        let _ = sqlx::query(
            r#"ALTER TABLE chat_record_read ADD COLUMN reported_timestamp INTEGER NOT NULL DEFAULT 0"#,
        )
        .execute(pool_sqlite)
        .await; // 列已存在则忽略

        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}
