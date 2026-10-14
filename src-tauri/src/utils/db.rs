//! 全局 SQLite 连接池访问器。
//!
//! 原先定义在 `dao`, 被 `entity`(充血模型的 CRUD)反向引用形成循环;
//! 下沉到中立模块后 `entity`/`dao` 均可向下依赖。`dao` 侧保留 re-export 以兼容旧路径。

use anyhow::anyhow;
use sqlx::SqlitePool;

use crate::{GLOBAL_COMMON_SQL_POOL, GLOBAL_PRIVATE_SQL_POOL, GLOBAL_SQL_POOL};

// 用户数据库
pub async fn get_db_client() -> Result<SqlitePool, anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    Ok(pool_sqlite.clone())
}

// 公共数据库
pub async fn get_common_db_client() -> Result<SqlitePool, anyhow::Error> {
    let pool_guard = GLOBAL_COMMON_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    Ok(pool_sqlite.clone())
}

// 用户加密数据库
pub async fn get_private_db_client() -> Result<SqlitePool, anyhow::Error> {
    let pool_guard = GLOBAL_PRIVATE_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    Ok(pool_sqlite.clone())
}
