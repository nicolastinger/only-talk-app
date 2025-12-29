use crate::GLOBAL_SQL_POOL;
use anyhow::anyhow;

pub mod chat_record_db;
mod create_table;
pub mod friend_db;
pub mod init_common_db;
pub mod init_db;
pub mod session_db;

pub async fn get_db_client() -> Result<sqlx::SqlitePool, anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    Ok(pool_sqlite.clone())
}
