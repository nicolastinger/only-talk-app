use crate::cmd::api_controller::get_user_map;
use crate::store::create_table::init_user_ddl;
use crate::utils::global_static_str::SQLITE_PATH;
use crate::GLOBAL_SQL_POOL;
use anyhow::anyhow;
use log::info;
use sqlx::sqlite::SqlitePoolOptions;
use std::fs;
use std::fs::File;
use std::path::Path;
use std::sync::Arc;

pub async fn init_sqlite() -> Result<(), anyhow::Error> {
    let db_path = get_db_path().await;

    let db_url = format!("sqlite://{}", db_path);

    // 创建数据库连接池
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    let pool_arc = Arc::new(pool);

    let pool_arc_clone = pool_arc.clone();
    // 初始化全局变量
    {
        let mut global_pool = GLOBAL_SQL_POOL.write().await;
        *global_pool = Some(pool_arc_clone);
    }

    {
        let pool_guard = GLOBAL_SQL_POOL.read().await;
        let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
        // 创建表
        init_user_ddl(pool_sqlite).await?;
    }
    Ok(())
}

async fn get_db_path() -> String {
    let path_buf = std::env::current_dir().expect("找不到路径");
    info!("当前程序路径 {}", path_buf.display());
    let account = get_user_map("account".to_string())
        .await
        .expect("获取用户信息失败");
    let sqlite_path = Path::new(SQLITE_PATH);

    // 检查目录是否存在，不存在则新建
    if !sqlite_path.exists() {
        fs::create_dir(sqlite_path).expect("创建数据库目录失败");
        info!("已创建目录: dbData");
    }

    let db_file_path = format!("./dbData/{}", account);

    let db_data_dir = Path::new(&db_file_path);

    // 检查目录是否存在，不存在则新建
    if !db_data_dir.exists() {
        fs::create_dir(db_data_dir).expect("创建 dbData 目录失败");
        info!("已创建目录: dbData");
    }

    let db_file_path = db_data_dir.join("app.db"); // 路径拼接

    // 检查文件是否存在，不存在则新建
    if !db_file_path.exists() {
        File::create(&db_file_path).expect("创建 app.db 文件失败");
        info!("已创建文件: {}", db_file_path.display());
    }
    db_file_path.to_str().expect("错误的数据库文件").to_string()
}
