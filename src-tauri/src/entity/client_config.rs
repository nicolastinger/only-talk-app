use anyhow::Error;
use log::info;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

/// 客户端配置表(公共库 common.db): key-value 持久化客户端状态。
///
/// 目前承载: `server.api_base`(HTTP API 地址)、`server.domain`(QUIC 域名)、
/// `app.theme`(默认主题)、`app.language`(默认语言)。后续按需扩展。
#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct ClientConfig {
    /// 主键ID
    pub id: Option<i64>,
    /// 配置键(全局唯一)
    pub config_key: Option<String>,
    /// 配置值
    pub config_value: Option<String>,
    /// 更新时间(毫秒)
    pub updated_at: Option<i64>,
}

impl SqliteStore for ClientConfig {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        info!("创建客户端配置表...");
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS client_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_key TEXT NOT NULL UNIQUE,
                config_value TEXT NOT NULL,
                updated_at INTEGER
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