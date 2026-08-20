use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

/// 日志等级常量
#[allow(dead_code)]
pub const LOG_LEVEL_DEBUG: i32 = 0;
pub const LOG_LEVEL_INFO: i32 = 1;
pub const LOG_LEVEL_WARN: i32 = 2;
pub const LOG_LEVEL_ERROR: i32 = 3;

/// 通用日志表
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct AppLog {
    pub id: i64,
    pub log_type: String,    //日志类型
    pub level: i32,          //等级: 0=Debug 1=Info 2=Warn 3=Error
    pub source: String,      //来源模块
    pub raw: String,         //日志文本raw消息
    pub remote_addr: String, //远端地址
    pub detail: String,      //扩展详情(JSON)
    pub created_at: i64,     //创建时间(毫秒时间戳)
}

impl SqliteStore for AppLog {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS app_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_type TEXT NOT NULL DEFAULT 'QUIC',
            level INTEGER NOT NULL DEFAULT 1,
            source TEXT NOT NULL DEFAULT '',
            raw TEXT NOT NULL,
            remote_addr TEXT NOT NULL DEFAULT '',
            detail TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_app_log_created_at ON app_log(created_at)"#)
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
