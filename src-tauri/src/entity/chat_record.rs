use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::get_private_db_client;
use crate::dao::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatRecord {
    pub id: i64,
    pub nano_id: String,
    pub text_type: u16,    //消息类型, 0: 原生文本, 1: JSON文本等等，详细请参考
    pub raw: String,       //数据
    pub recv_user: String, //接收用户
    pub send_user: String, //发送用户
    pub timestamp: i64,
}

impl SqliteStore for ChatRecord {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS chat_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL UNIQUE,
            raw TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
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

impl ChatRecord {
    /// 获取目标用户聊天条数
    pub async fn query_chat_record_count_by_friend(
        uuid: &str,
        friend_id: &str,
    ) -> Result<i32, anyhow::Error> {
        let pool_sqlite = get_private_db_client().await?;
        let record: (i32,) = sqlx::query_as(r#"select count(*) from chat_record where (send_user = ?1 and recv_user = ?2) or (send_user = ?2 and recv_user = ?1)"#)
            .bind(uuid)
            .bind(friend_id)
            .fetch_one(&pool_sqlite)
            .await?;
        Ok(record.0)
    }

    /// 通过 biz_id 查询文件消息的原始文件名和文件类型
    /// biz_id 存储在 raw 字段的 JSON 中
    pub async fn get_file_info_by_biz_id(
        biz_id: &str,
    ) -> Result<Option<(String, String)>, anyhow::Error> {
        let pool_sqlite = get_private_db_client().await?;
        // 查询 text_type=3 (文件类型) 且 raw 中包含该 biz_id 的记录
        let record: Option<(String,)> = sqlx::query_as(
            r#"SELECT raw FROM chat_record WHERE text_type = 3 AND raw LIKE ? LIMIT 1"#,
        )
        .bind(format!("%\"biz_id\":\"{}\"%", biz_id))
        .fetch_optional(&pool_sqlite)
        .await?;

        if let Some((raw,)) = record {
            // 解析 JSON 获取 file_name 和 file_type
            let json: serde_json::Value = serde_json::from_str(&raw)?;
            let file_name = json["file_name"].as_str().map(|s| s.to_string());
            let file_type = json["file_type"].as_str().map(|s| s.to_string());
            if let (Some(name), Some(ext)) = (file_name, file_type) {
                return Ok(Some((name, ext)));
            }
        }
        Ok(None)
    }
}
