use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::get_db_client;
use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct GroupMember {
    pub id: i64,
    pub group_id: String,
    pub user_id: String,
    pub role: i64,
    pub nickname: String,
    pub joined_at: i64,
    pub is_del: i64,
}

impl GroupMember {
    pub async fn insert_member(member: &GroupMember) -> Result<(), anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        sqlx::query(
            r#"INSERT INTO group_member (group_id, user_id, role, nickname, joined_at, is_del)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(group_id, user_id) DO UPDATE SET
            role = excluded.role,
            nickname = excluded.nickname,
            is_del = excluded.is_del"#,
        )
        .bind(&member.group_id)
        .bind(&member.user_id)
        .bind(member.role)
        .bind(&member.nickname)
        .bind(member.joined_at)
        .bind(member.is_del)
        .execute(&pool_sqlite)
        .await?;
        Ok(())
    }

    pub async fn upsert_members(members: &[GroupMember]) -> Result<(), anyhow::Error> {
        for member in members {
            Self::insert_member(member).await?;
        }
        Ok(())
    }

    pub async fn remove_member(group_id: &str, user_id: &str) -> Result<(), anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        sqlx::query("UPDATE group_member SET is_del = 1 WHERE group_id = ?1 AND user_id = ?2")
            .bind(group_id)
            .bind(user_id)
            .execute(&pool_sqlite)
            .await?;
        Ok(())
    }

    pub async fn query_members(group_id: &str) -> Result<Vec<GroupMember>, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let records = sqlx::query_as::<_, GroupMember>(
            "SELECT * FROM group_member WHERE group_id = ?1 AND is_del = 0",
        )
        .bind(group_id)
        .fetch_all(&pool_sqlite)
        .await?;
        Ok(records)
    }

    pub async fn query_member(
        group_id: &str,
        user_id: &str,
    ) -> Result<Option<GroupMember>, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let result = sqlx::query_as::<_, GroupMember>(
            "SELECT * FROM group_member WHERE group_id = ?1 AND user_id = ?2 AND is_del = 0",
        )
        .bind(group_id)
        .bind(user_id)
        .fetch_optional(&pool_sqlite)
        .await?;
        Ok(result)
    }
}

impl SqliteStore for GroupMember {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS group_member (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role INTEGER NOT NULL DEFAULT 0,
            nickname TEXT NOT NULL DEFAULT '',
            joined_at INTEGER NOT NULL,
            is_del INTEGER NOT NULL DEFAULT 0,
            UNIQUE(group_id, user_id)
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
