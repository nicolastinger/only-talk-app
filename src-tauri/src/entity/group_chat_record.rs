use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::get_private_db_client;
use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct GroupChatRecord {
    pub id: i64,
    pub nano_id: String,
    pub text_type: u16,
    pub raw: String,
    pub group_id: String,
    pub send_user: String,
    pub timestamp: i64,
}

impl SqliteStore for GroupChatRecord {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS group_chat_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL UNIQUE,
            raw TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            group_id TEXT NOT NULL,
            text_type INTEGER NOT NULL DEFAULT 0
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

impl GroupChatRecord {
    pub async fn insert(record: &GroupChatRecord) -> Result<(), anyhow::Error> {
        let pool_sqlite = get_private_db_client().await?;
        sqlx::query(
            r#"INSERT OR IGNORE INTO group_chat_record (nano_id, raw, timestamp, send_user, group_id, text_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#
        )
        .bind(&record.nano_id)
        .bind(&record.raw)
        .bind(record.timestamp)
        .bind(&record.send_user)
        .bind(&record.group_id)
        .bind(record.text_type)
        .execute(&pool_sqlite)
        .await?;
        Ok(())
    }

    pub async fn query_by_group_id(
        group_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<GroupChatRecord>, anyhow::Error> {
        let pool_sqlite = get_private_db_client().await?;
        let records = sqlx::query_as::<_, GroupChatRecord>(
            r#"SELECT * from(SELECT * FROM group_chat_record WHERE group_id = ?1 order by timestamp desc limit ?2 offset ?3) order by timestamp asc"#
        )
        .bind(group_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool_sqlite)
        .await?;
        Ok(records)
    }

    pub async fn query_last_record(
        group_id: &str,
    ) -> Result<Option<GroupChatRecord>, anyhow::Error> {
        let pool_sqlite = get_private_db_client().await?;
        let record = sqlx::query_as::<_, GroupChatRecord>(
            r#"select * from group_chat_record where group_id = ?1 order by timestamp desc limit 1"#
        )
        .bind(group_id)
        .fetch_optional(&pool_sqlite)
        .await?;
        Ok(record)
    }
}