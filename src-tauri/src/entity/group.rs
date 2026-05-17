use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::get_db_client;
use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Group {
    pub id: i64,
    pub group_id: String,
    pub group_name: String,
    pub group_icon: String,
    pub owner_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub member_count: i64,
    pub is_del: i64,
    pub is_show: i64,
    pub version: i64,
}

impl Group {
    pub async fn insert_group(group: &Group) -> Result<(), anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        sqlx::query(
            r#"INSERT INTO group_info (group_id, group_name, group_icon, owner_id, created_at, updated_at, member_count, is_del, is_show, version)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(group_id) DO UPDATE SET
            group_name = excluded.group_name,
            group_icon = excluded.group_icon,
            owner_id = excluded.owner_id,
            updated_at = excluded.updated_at,
            member_count = excluded.member_count,
            is_del = excluded.is_del,
            is_show = excluded.is_show,
            version = excluded.version"#,
        )
        .bind(&group.group_id)
        .bind(&group.group_name)
        .bind(&group.group_icon)
        .bind(&group.owner_id)
        .bind(group.created_at)
        .bind(group.updated_at)
        .bind(group.member_count)
        .bind(group.is_del)
        .bind(group.is_show)
        .bind(group.version)
        .execute(&pool_sqlite)
        .await?;
        Ok(())
    }

    pub async fn query_by_group_id(group_id: &str) -> Result<Option<Group>, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let result = sqlx::query_as::<_, Group>(
            "SELECT * FROM group_info WHERE group_id = ?1 AND is_del = 0",
        )
        .bind(group_id)
        .fetch_optional(&pool_sqlite)
        .await?;
        Ok(result)
    }

    pub async fn query_user_groups(me: &str) -> Result<Vec<Group>, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let records = sqlx::query_as::<_, Group>(
            r#"SELECT g.* FROM group_info g
            INNER JOIN group_member gm ON g.group_id = gm.group_id
            WHERE gm.user_id = ?1 AND gm.is_del = 0 AND g.is_del = 0 AND g.is_show = 1"#,
        )
        .bind(me)
        .fetch_all(&pool_sqlite)
        .await?;
        Ok(records)
    }

    pub async fn soft_delete(group_id: &str) -> Result<(), anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        sqlx::query("UPDATE group_info SET is_del = 1 WHERE group_id = ?1")
            .bind(group_id)
            .execute(&pool_sqlite)
            .await?;
        Ok(())
    }

    pub async fn get_last_group(me: &str) -> Result<Option<Group>, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let result = sqlx::query_as::<_, Group>(
            r#"SELECT g.* FROM group_info g
            INNER JOIN group_member gm ON g.group_id = gm.group_id
            WHERE gm.user_id = ?1 AND gm.is_del = 0 AND g.is_del = 0
            ORDER BY g.updated_at DESC LIMIT 1"#,
        )
        .bind(me)
        .fetch_optional(&pool_sqlite)
        .await?;
        Ok(result)
    }
}

impl SqliteStore for Group {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS group_info (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id TEXT NOT NULL UNIQUE,
            group_name TEXT NOT NULL,
            group_icon TEXT NOT NULL DEFAULT '',
            owner_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            member_count INTEGER NOT NULL DEFAULT 0,
            is_del INTEGER NOT NULL DEFAULT 0,
            is_show INTEGER NOT NULL DEFAULT 1,
            version INTEGER NOT NULL DEFAULT 0
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        // Add member_count column if it doesn't exist (migration from old schema)
        let result = sqlx::query("ALTER TABLE group_info ADD COLUMN member_count INTEGER NOT NULL DEFAULT 0")
            .execute(pool_sqlite)
            .await;
        match result {
            Ok(_) => {}
            Err(_) => {} // Column already exists, ignore
        }
        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}
