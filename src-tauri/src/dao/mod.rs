use anyhow::anyhow;

use crate::{GLOBAL_COMMON_SQL_POOL, GLOBAL_PRIVATE_SQL_POOL, GLOBAL_SQL_POOL};

pub mod chat_record_db;
mod create_table;
pub mod file_record_db;
pub mod friend_db;
pub mod init_common_db;
pub mod init_db;
pub mod session_db;
pub mod store;
pub mod init_private_db;

// 用户数据库
pub async fn get_db_client() -> Result<sqlx::SqlitePool, anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    Ok(pool_sqlite.clone())
}

// 公共数据库
pub async fn get_common_db_client() -> Result<sqlx::SqlitePool, anyhow::Error> {
    let pool_guard = GLOBAL_COMMON_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    Ok(pool_sqlite.clone())
}

// 用户加密数据库
pub async fn get_private_db_client() -> Result<sqlx::SqlitePool, anyhow::Error> {
    let pool_guard = GLOBAL_PRIVATE_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    Ok(pool_sqlite.clone())
}
