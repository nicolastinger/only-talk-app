use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::models::entity::store::SqliteStore;

/// 好友专属聊天背景(用户库): 仅客户端保存, 不上传服务端。
///
/// 每个好友最多一张专属背景, 文件同样存放在 `app_data_dir/chat_backgrounds/`;
/// 好友没有专属背景时, 聊天页回退到全局聊天背景(或主题渐变)。
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct FriendChatBackground {
    /// 好友 uuid(主键)
    pub friend_uuid: String,
    /// 相对 `chat_backgrounds` 目录的文件名
    pub file_name: String,
    /// 设置时间(毫秒)
    pub created_at: i64,
}

impl SqliteStore for FriendChatBackground {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS friend_chat_background (
                friend_uuid TEXT PRIMARY KEY,
                file_name   TEXT NOT NULL,
                created_at  INTEGER NOT NULL
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
        // 用户数据: 不随初始化删除
        Ok(())
    }
}
