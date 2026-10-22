use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::models::entity::store::SqliteStore;

/// 聊天背景记录(用户库): 仅保存在客户端, 从不上传服务端。
///
/// 图片文件存放在 `app_data_dir/chat_backgrounds/<file_name>`(独立目录, 不参与任何缓存清理);
/// 表里保留全部历史记录, 用 `is_active` 标记当前生效的那一张, 支持随时切换回历史背景。
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ChatBackground {
    pub id: i64,
    /// 相对 `chat_backgrounds` 目录的文件名
    pub file_name: String,
    /// 是否当前生效: 1-生效, 0-历史记录
    pub is_active: i64,
    /// 创建时间(毫秒)
    pub created_at: i64,
}

impl SqliteStore for ChatBackground {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS chat_background (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name  TEXT NOT NULL UNIQUE,
                is_active  INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            )"#,
        )
        .execute(pool_sqlite)
        .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_chat_background_active ON chat_background(is_active)",
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        // 用户数据: 不随初始化删除
        Ok(())
    }
}
