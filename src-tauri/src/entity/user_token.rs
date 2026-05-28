use anyhow::Error;
use log::info;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::get_common_db_client;
use crate::dao::store::SqliteStore;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct UserToken {
    pub id: Option<i64>,
    pub user_id: Option<String>,
    pub refresh_token: Option<String>,
    pub local_credit: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub version: Option<i64>,
}

impl SqliteStore for UserToken {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        info!("创建用户Token记录表...");
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS user_token (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE,
                refresh_token TEXT,
                local_credit TEXT,
                created_at INTEGER,
                updated_at INTEGER,
                version INTEGER DEFAULT 0
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

impl UserToken {
    pub async fn upsert(token: &UserToken) -> Result<(), Error> {
        let pool_sqlite = get_common_db_client().await?;
        sqlx::query(
            r#"INSERT INTO user_token (user_id, refresh_token, local_credit, created_at, updated_at, version)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(user_id) DO UPDATE SET
                   refresh_token = excluded.refresh_token,
                   local_credit = excluded.local_credit,
                   updated_at = excluded.updated_at,
                   version = version + 1"#,
        )
        .bind(&token.user_id)
        .bind(&token.refresh_token)
        .bind(&token.local_credit)
        .bind(&token.created_at)
        .bind(&token.updated_at)
        .bind(&token.version)
        .execute(&pool_sqlite)
        .await?;
        Ok(())
    }

    pub async fn query_by_user_id(user_id: &str) -> Result<Option<UserToken>, Error> {
        let pool_sqlite = get_common_db_client().await?;
        let record = sqlx::query_as::<_, UserToken>(
            r#"SELECT * FROM user_token WHERE user_id = ?1"#,
        )
        .bind(user_id)
        .fetch_optional(&pool_sqlite)
        .await?;
        Ok(record)
    }

    pub async fn query_by_refresh_token(refresh_token: &str) -> Result<Option<UserToken>, Error> {
        let pool_sqlite = get_common_db_client().await?;
        let record = sqlx::query_as::<_, UserToken>(
            r#"SELECT * FROM user_token WHERE refresh_token = ?1"#,
        )
        .bind(refresh_token)
        .fetch_optional(&pool_sqlite)
        .await?;
        Ok(record)
    }

    pub async fn delete_by_user_id(user_id: &str) -> Result<(), Error> {
        let pool_sqlite = get_common_db_client().await?;
        sqlx::query(r#"DELETE FROM user_token WHERE user_id = ?1"#)
            .bind(user_id)
            .execute(&pool_sqlite)
            .await?;
        Ok(())
    }
}
