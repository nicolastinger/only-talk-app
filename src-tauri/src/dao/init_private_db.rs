use std::fs;
use std::fs::File;
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;
use std::thread::sleep;
use std::time::Duration;
use anyhow::anyhow;
use log::info;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use crate::config::get_config;
use crate::dao::create_table::{init_private_ddl, init_user_ddl};
use crate::{config, GLOBAL_PRIVATE_SQL_POOL, GLOBAL_SQL_POOL};
use crate::cmd::user_controller::get_user_map;
use crate::utils::global_static_str::{APP_PATH, PRIVATE_DB, PRIVATE_DB_KEY, SQLITE_PATH, USER_DB};

/// 初始化加密的私有数据库
/// 使用 SQLCipher 静态链接编译实现数据库级加密
pub async fn init_private_db() -> Result<(), anyhow::Error> {
    let db_path = get_db_path().await;

    let db_url = format!("sqlite://{}", db_path);

    // 创建数据库连接池
    let private_opts = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .pragma("key", PRIVATE_DB_KEY);

    let pool = SqlitePoolOptions::new().max_connections(5).connect_with(private_opts).await?;

    // 验证加密库是否可用
    sqlx::query("SELECT count(*) FROM sqlite_master").execute(&pool).await?;
    // 初始化测试表
    sqlx::query("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)")
        .execute(&pool)
        .await?;
    // 插入测试数据
    sqlx::query("INSERT INTO test (name) VALUES (?)")
        .execute(&pool)
        .await?;
    // 查询测试数据
    let rows = sqlx::query("SELECT * FROM test").fetch_all(&pool).await?;
    println!("{:?}", rows.len());

    let pool_arc = Arc::new(pool);

    let pool_arc_clone = pool_arc.clone();
    // 初始化全局变量
    {
        let mut global_pool = GLOBAL_PRIVATE_SQL_POOL.write().await;
        *global_pool = Some(pool_arc_clone);
    }

    {
        let pool_guard = GLOBAL_PRIVATE_SQL_POOL.read().await;
        let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
        // 创建表
        init_private_ddl(pool_sqlite).await?;
    }
    Ok(())
}

async fn get_db_path() -> String {
    let app_path = get_config(APP_PATH).unwrap_or_else(|| {
        // TODO emit给前端，3秒后自动关闭程序
        // 获取应用路径失败，抛出异常
        sleep(Duration::from_secs(3));
        panic!("获取应用路径失败");
    });
    let account = get_user_map("account".to_string()).await.expect("获取用户信息失败");
    let sqlite_path = Path::new(&app_path).join(SQLITE_PATH);

    let db_data_dir = Path::new(&app_path).join(SQLITE_PATH).join(&account);
    let db_file_path = Path::new(&app_path).join(SQLITE_PATH).join(&account).join(PRIVATE_DB); // 路径拼接

    // 检查目录是否存在，不存在则新建
    if !sqlite_path.exists() {
        fs::create_dir(sqlite_path).expect("创建数据库目录失败");
        info!("已创建目录: dbData");
    }

    // 检查目录是否存在，不存在则新建
    if !db_data_dir.exists() {
        fs::create_dir(db_data_dir).expect("创建 dbData 目录失败");
        info!("已创建目录: dbData");
    }

    // 检查文件是否存在，不存在则新建
    if !db_file_path.exists() {
        File::create(&db_file_path).expect("创建 app.db 文件失败");
        info!("已创建文件: {}", db_file_path.display());
    }
    db_file_path.to_str().expect("错误的数据库文件").to_string()
}
