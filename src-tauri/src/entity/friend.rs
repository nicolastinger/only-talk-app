use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Friend {
    pub id: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub friend_id: String,
    pub friend_account: String,
    pub friend_name: String,
    pub friend_icon: String,
    pub friend_info: String,
    pub friend_status: i32,
    pub me: String,
    pub is_del: bool,
    pub is_block: i32,
    pub is_mute: i32,
    pub is_top: i32,
    pub is_show: i32,
    pub version: i32,
}

impl SqliteStore for Friend {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS friend (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            friend_id TEXT NOT NULL,
            friend_account TEXT NOT NULL,
            friend_name TEXT NOT NULL,
            friend_icon TEXT NOT NULL,
            friend_info TEXT NOT NULL,
            friend_status INTEGER NOT NULL DEFAULT 0,
            me TEXT NOT NULL,
            is_del INTEGER NOT NULL DEFAULT 0,
            is_block INTEGER NOT NULL DEFAULT 0,
            is_mute INTEGER NOT NULL DEFAULT 0,
            is_top INTEGER NOT NULL DEFAULT 0,
            is_show INTEGER NOT NULL DEFAULT 1,
            version INTEGER NOT NULL DEFAULT 0,
            UNIQUE(friend_id, me)
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
