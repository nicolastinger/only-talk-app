use serde::{Deserialize, Serialize};
use sqlx::FromRow;
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

impl FileRecord {
    /// 创建一个新的文件记录
    pub fn new(
        biz_id: Option<String>,
        uuid: Option<String>,
        file_name: Option<String>,
        file_path: Option<String>,
        file_size: Option<i64>,
        mime_type: Option<String>,
        file_hash: Option<String>,
        status: Option<i32>,
        created_at: Option<i64>,
        updated_at: Option<i64>,
    ) -> Self {
        FileRecord {
            id: None,
            biz_id,
            uuid,
            file_name,
            file_path,
            file_size,
            mime_type,
            file_hash,
            status,
            created_at,
            updated_at,
        }
    }

    /// 插入一条新的文件记录
    pub async fn insert(&self, pool: &sqlx::PgPool) -> Result<FileRecord, sqlx::Error> {
        let record = sqlx::query_as!(
            FileRecord,
            r#"
            INSERT INTO file_record (
                biz_id,
                uuid,
                file_name,
                file_path,
                file_size,
                mime_type,
                file_hash,
                status,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            "#,
            self.biz_id,
            self.uuid,
            self.file_name,
            self.file_path,
            self.file_size,
            self.mime_type,
            self.file_hash,
            self.status,
            self.created_at,
            self.updated_at
        )
        .fetch_one(pool)
        .await?;
        Ok(record)
    }

    /// 更新文件记录
    pub async fn update(&self, pool: &sqlx::PgPool) -> Result<FileRecord, sqlx::Error> {
        let record = sqlx::query_as!(
            FileRecord,
            r#"
            UPDATE file_record
            SET biz_id = $1,
                uuid = $2,
                file_name = $3,
                file_path = $4,
                file_size = $5,
                mime_type = $6,
                file_hash = $7,
                status = $8,
                updated_at = $9
            WHERE id = $10
            RETURNING *
            "#,
            self.biz_id,
            self.uuid,
            self.file_name,
            self.file_path,
            self.file_size,
            self.mime_type,
            self.file_hash,
            self.status,
            self.updated_at,
            self.id
        )
        .fetch_one(pool)
        .await?;
        Ok(record)
    }

    /// 删除文件记录
    pub async fn delete(&self, pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            DELETE FROM file_record
            WHERE id = $1
            "#,
            self.id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// 根据ID获取文件记录
    pub async fn get_by_id(id: i32, pool: &sqlx::PgPool) -> Result<FileRecord, sqlx::Error> {
        let record = sqlx::query_as!(
            FileRecord,
            r#"
            SELECT * FROM file_record
            WHERE id = $1
            "#,
            id
        )
        .fetch_one(pool)
        .await?;
        Ok(record)
    }

    /// 根据业务id获取文件记录
    pub async fn get_by_biz_id(biz_id: i32, pool: &sqlx::PgPool) -> Result<Vec<FileRecord>, sqlx::Error> {
        let records = sqlx::query_as!(
            FileRecord,
            r#"
            SELECT * FROM file_record
            WHERE biz_id = $1
            "#,
            biz_id
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }
}
