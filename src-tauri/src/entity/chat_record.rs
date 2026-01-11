use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use crate::store::get_db_client;
use crate::store::store::SqliteStore;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatRecord {
    pub id: i64,
    pub nano_id: String,
    pub text_type: u16,    //消息类型
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

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }

    async fn drop_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}

impl ChatRecord {
    /// 获取目标用户聊天条数
    pub async fn query_chat_record_count_by_friend(
        uuid: &str,
        friend_id: &str,
    ) -> Result<i32, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let record: (i32,) = sqlx::query_as(r#"select count(*) from chat_record where (send_user = ?1 and recv_user = ?2) or (send_user = ?2 and recv_user = ?1)"#)
            .bind(uuid)
            .bind(friend_id)
            .fetch_one(&pool_sqlite)
            .await?;
        Ok(record.0)
    }
}

