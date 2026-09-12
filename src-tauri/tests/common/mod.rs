//! 集成测试共享脚手架。
//!
//! 所有触碰全局连接池(`GLOBAL_*_SQL_POOL`)的 DAO 集成测试必须经过这里的
//! `with_user_db` / `with_common_db` / `with_private_db`:
//! - 在系统临时目录创建一个唯一的 sqlite 文件并初始化表结构;
//! - 测试执行完毕后关闭连接池、清空全局池并删除临时文件(含 -wal/-shm/-journal);
//! - 测试 panic 残留的文件由下一次 setup 兜底删除, 保证最终清理。

#![allow(dead_code)]

use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use app_lib::dao::create_table::{init_common_ddl, init_private_ddl, init_user_ddl};
use app_lib::{GLOBAL_COMMON_SQL_POOL, GLOBAL_PRIVATE_SQL_POOL, GLOBAL_SQL_POOL};

/// 固定测试密钥(32位hex), 与生产服务端签发的 db_key 格式一致
const TEST_PRIVATE_KEY: &str = "0123456789abcdef0123456789abcdef";

/// 串行化所有触碰全局连接池的测试(全局池是进程级 lazy_static)
static DB_TEST_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

/// 记录当前测试创建的临时 db 文件, panic 残留由下一次 setup 兜底删除
static LAST_DB_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Clone, Copy)]
enum DbKind {
    User,
    Common,
    Private,
}

impl DbKind {
    fn file_prefix(self) -> &'static str {
        match self {
            DbKind::User => "user",
            DbKind::Common => "common",
            DbKind::Private => "private",
        }
    }
}

/// 在 user 明文库(user.db 表结构)上执行测试闭包。
///
/// 闭包按值接收已初始化表结构的连接池(内部为 Arc, clone 廉价),
/// 测试可通过全局池或该池直接调用 DAO 函数 / 执行原始 SQL。
pub async fn with_user_db<F, Fut>(f: F)
where
    F: FnOnce(SqlitePool) -> Fut,
    Fut: Future<Output = ()>,
{
    let _guard = DB_TEST_LOCK.lock().await;
    let (pool, path) = setup(DbKind::User).await;
    init_user_ddl(&pool).await.expect("初始化 user 表结构失败");
    f(pool.clone()).await;
    teardown(pool, &path).await;
}

/// 在 common 明文库(common.db 表结构)上执行测试闭包。
pub async fn with_common_db<F, Fut>(f: F)
where
    F: FnOnce(SqlitePool) -> Fut,
    Fut: Future<Output = ()>,
{
    let _guard = DB_TEST_LOCK.lock().await;
    let (pool, path) = setup(DbKind::Common).await;
    init_common_ddl(&pool).await.expect("初始化 common 表结构失败");
    f(pool.clone()).await;
    teardown(pool, &path).await;
}

/// 在 private 加密库(SQLCipher, 与生产 open_private_pool 相同的 key pragma)上执行测试闭包。
pub async fn with_private_db<F, Fut>(f: F)
where
    F: FnOnce(SqlitePool) -> Fut,
    Fut: Future<Output = ()>,
{
    let _guard = DB_TEST_LOCK.lock().await;
    let (pool, path) = setup(DbKind::Private).await;
    init_private_ddl(&pool).await.expect("初始化 private 表结构失败");
    f(pool.clone()).await;
    teardown(pool, &path).await;
}

async fn setup(kind: DbKind) -> (SqlitePool, PathBuf) {
    // 1. 释放上一次(可能 panic 残留)的全局池, 确保旧文件可被删除
    clear_all_global_pools().await;

    // 2. 兜底删除上一次 panic 残留的临时文件
    {
        let mut last = LAST_DB_FILE.lock().expect("获取 LAST_DB_FILE 锁失败");
        if let Some(prev) = last.take() {
            remove_db_files(&prev);
        }
    }

    // 3. 创建新的唯一临时文件并记录, 供 panic 兜底清理
    let path = temp_db_path(kind);
    {
        let mut last = LAST_DB_FILE.lock().expect("获取 LAST_DB_FILE 锁失败");
        *last = Some(path.clone());
    }

    let pool = match kind {
        DbKind::Private => {
            let opts = SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true)
                // sqlx 会把 pragma 值原样拼进 SQL, 需自带引号(与生产代码一致)
                .pragma("key", format!("'{}'", TEST_PRIVATE_KEY));
            SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(opts)
                .await
                .expect("创建 private 测试数据库失败")
        }
        _ => {
            let opts = SqliteConnectOptions::new().filename(&path).create_if_missing(true);
            SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(opts)
                .await
                .expect("创建测试数据库失败")
        }
    };

    match kind {
        DbKind::User => {
            *GLOBAL_SQL_POOL.write().await = Some(Arc::new(pool.clone()));
        }
        DbKind::Common => {
            *GLOBAL_COMMON_SQL_POOL.write().await = Some(Arc::new(pool.clone()));
        }
        DbKind::Private => {
            *GLOBAL_PRIVATE_SQL_POOL.write().await = Some(Arc::new(pool.clone()));
        }
    }

    (pool, path)
}

async fn teardown(pool: SqlitePool, path: &Path) {
    pool.close().await;
    clear_all_global_pools().await;
    remove_db_files(path);
    {
        let mut last = LAST_DB_FILE.lock().expect("获取 LAST_DB_FILE 锁失败");
        *last = None;
    }
}

async fn clear_all_global_pools() {
    GLOBAL_SQL_POOL.write().await.take();
    GLOBAL_COMMON_SQL_POOL.write().await.take();
    GLOBAL_PRIVATE_SQL_POOL.write().await.take();
}

fn temp_db_path(kind: DbKind) -> PathBuf {
    std::env::temp_dir().join(format!("onlytalk_test_{}_{}.db", kind.file_prefix(), Uuid::new_v4()))
}

fn remove_db_files(path: &Path) {
    let path_str = path.to_string_lossy();
    for variant in [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path_str)),
        PathBuf::from(format!("{}-shm", path_str)),
        PathBuf::from(format!("{}-journal", path_str)),
    ] {
        std::fs::remove_file(variant).ok();
    }
}
