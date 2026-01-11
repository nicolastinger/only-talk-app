use crate::store::store::SqliteStore;
use anyhow::Error;
use log::info;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use crate::store::get_common_db_client;

/// 本地文件记录表
#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct FileRecord {
    /// 主键ID
    pub id: Option<i64>,
    /// 业务ID
    pub biz_id: Option<String>,
    /// 文件唯一标识符
    pub uuid: Option<String>,
    /// 文件名
    pub file_name: Option<String>,
    /// 文件路径
    pub file_path: Option<String>,
    /// 文件大小（字节）
    pub file_size: Option<i64>,
    /// 文件MIME类型
    pub mime_type: Option<String>,
    /// 文件哈希值（用于去重）
    pub file_hash: Option<String>,
    /// 文件状态（0-正常，1-已删除，2-临时文件）
    pub status: Option<i32>,
    /// 创建时间
    pub created_at: Option<i64>,
    /// 更新时间
    pub updated_at: Option<i64>,
}

impl SqliteStore for FileRecord {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        info!("创建文件记录表...");
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS file_record (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                biz_id TEXT,
                uuid TEXT,
                file_name TEXT,
                file_path TEXT,
                file_size INTEGER,
                mime_type TEXT,
                file_hash TEXT,
                status INTEGER DEFAULT 0,
                created_at INTEGER,
                updated_at INTEGER
                )"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        info!("更新文件记录表...");
        Ok(())
    }

    async fn drop_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        info!("删除文件记录表...");
        Ok(())
    }
}

impl FileRecord {
    // 通过biz_id获取文件记录
    pub async fn get_by_biz_id(biz_id: &str) -> Result<Vec<FileRecord>, Error> {
        let pool_sqlite = get_common_db_client().await?;
        let file_record = sqlx::query_as::<_, FileRecord>(
            r#"SELECT * FROM file_record WHERE biz_id = ? AND status = 0"#,
        )
        .bind(biz_id)
        .fetch_all(&pool_sqlite)
        .await?;
        Ok(file_record)
    }
}
