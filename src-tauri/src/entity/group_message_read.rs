use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct GroupMessageRead {
    pub id: i64,
    pub nano_id: String,
    pub group_uuid: String,
    pub user_uuid: String,
    pub timestamp: i64,
}

impl SqliteStore for GroupMessageRead {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS group_message_read (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            group_uuid TEXT NOT NULL,
            user_uuid TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            reported_server_id INTEGER NOT NULL DEFAULT 0,
            UNIQUE(group_uuid, user_uuid)
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        // 迁移：补充已读上报游标列(老库无此列, SQLite 不支持 ADD COLUMN IF NOT EXISTS)
        let _ = sqlx::query(
            r#"ALTER TABLE group_message_read ADD COLUMN reported_server_id INTEGER NOT NULL DEFAULT 0"#,
        )
        .execute(pool_sqlite)
        .await; // 列已存在则忽略

        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}
