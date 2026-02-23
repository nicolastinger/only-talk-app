use std::fs::File;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::anyhow;
use log::info;
use sqlx::sqlite::SqlitePoolOptions;

use crate::dao::create_table::init_common_ddl;
use crate::utils::global_static_str::COMMON_DB;
use crate::GLOBAL_COMMON_SQL_POOL;

pub async fn init_common_sqlite(common_db_path: PathBuf) -> Result<(), anyhow::Error> {
    let db_path = get_common_db_path(common_db_path).await;

    let db_url = format!("sqlite://{}", db_path);

    // 创建数据库连接池
    let pool = SqlitePoolOptions::new().max_connections(5).connect(&db_url).await?;

    let pool_arc = Arc::new(pool);

    let pool_arc_clone = pool_arc.clone();
    // 初始化全局变量
    {
        let mut global_pool = GLOBAL_COMMON_SQL_POOL.write().await;
        *global_pool = Some(pool_arc_clone);
    }

    {
        let pool_guard = GLOBAL_COMMON_SQL_POOL.read().await;
        let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
        // 创建表
        init_common_ddl(pool_sqlite).await?;
    }
    Ok(())
}

async fn get_common_db_path(sqlite_path: PathBuf) -> String {
    let db_file_path = sqlite_path.join(COMMON_DB); // 路径拼接

    // 检查文件是否存在，不存在则新建
    if !db_file_path.exists() {
        File::create(&db_file_path).expect("创建 common.db 文件失败");
        info!("已创建文件: {}", db_file_path.display());
    }
    db_file_path.to_str().expect("错误的数据库文件").to_string()
}
