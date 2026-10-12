use std::fs;
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::anyhow;
use log::info;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{query, SqlitePool};

use crate::cmd::user_controller::get_user_map;
use crate::config::get_config;
use crate::dao::create_table::init_private_ddl;
use crate::dao::get_db_client;
use crate::service::user_service::get_user_info;
use crate::utils::global_static_str::{APP_PATH, PRIVATE_DB, SQLITE_PATH};
use crate::GLOBAL_PRIVATE_SQL_POOL;

/// 明文 user.db 中历史遗留的聊天数据表(聊天记录现统一存加密 private.db)
const LEGACY_PLAINTEXT_CHAT_TABLES: [&str; 7] = [
    "chat_record",
    "group_chat_record",
    "chat_record_send",
    "chat_record_ack",
    "group_message_ack",
    "group_message_read",
    "webrtc_signal",
];

/// 初始化加密的私有数据库。
///
/// 密钥来自服务端按「用户+设备指纹」签发(db_key)，同一用户各设备/历史指纹复用同一把
/// 底层密钥，指纹漂移或换机仍可打开本地库；每次登录拉取后仅存内存。
/// - 数据库文件不存在 → 用该密钥新建并建表；
/// - 文件已存在 → 先用该密钥打开并探测；失败说明文件由其它密钥加密(如旧版本静态key
///   加密的存量库)或已损坏，不迁移，改名备份后按新密钥重建(旧数据丢弃)。
pub async fn init_private_db() -> Result<(), anyhow::Error> {
    let db_path = get_db_path().await;

    let db_url = format!("sqlite://{}", db_path);

    // 登录后服务端签发的密钥已写入 GLOBAL_QUIC_USER_INFO
    let key = get_user_info("private_db_key").await?;

    let init_result = if Path::new(&db_path).exists() {
        match open_private_pool(&db_url, &key).await {
            Ok(pool) => store_pool_and_init(pool).await,
            Err(first_err) => {
                info!("私有数据库用当前密钥打开失败(旧密钥/损坏?), 备份后重建: {:?}", first_err);
                let now =
                    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
                let backup_path = format!("{}.{}.bak", db_path, now);
                fs::rename(&db_path, &backup_path)?;
                info!("已备份原私有数据库到: {}", backup_path);
                // 文件缺失或已备份重建 → create_if_missing 新建空库
                let pool = open_private_pool(&db_url, &key).await?;
                store_pool_and_init(pool).await
            }
        }
    } else {
        // 文件缺失 → create_if_missing 新建空库
        let pool = open_private_pool(&db_url, &key).await?;
        store_pool_and_init(pool).await
    };
    init_result?;

    // 聊天记录已落加密库后, 清理明文 user.db 中历史遗留的同名表
    drop_legacy_plaintext_chat_tables().await
}

/// 清理明文 user.db 中历史遗留的聊天数据表(无迁移, 直接删除)
async fn drop_legacy_plaintext_chat_tables() -> Result<(), anyhow::Error> {
    let pool = get_db_client().await?;
    for table in LEGACY_PLAINTEXT_CHAT_TABLES {
        query(&format!("DROP TABLE IF EXISTS {}", table)).execute(&pool).await?;
    }
    info!("已清理 user.db 中历史遗留的明文聊天数据表");
    Ok(())
}

/// 用指定密钥打开 SQLCipher 数据库(文件不存在则新建)，并执行一次探测查询验证密钥。
/// 密钥错误/库损坏时 SQLCipher 在查询阶段报错(如 file is not a database)，在此返回 Err。
async fn open_private_pool(db_url: &str, key: &str) -> Result<SqlitePool, anyhow::Error> {
    let private_opts = SqliteConnectOptions::from_str(db_url)?
        .create_if_missing(true)
        // sqlx 会把 pragma 值原样拼进 SQL(PRAGMA key = <value>), 需自带引号,
        // 否则 64 位十六进制密钥会被当成非法 token, 报 "unrecognized token"
        .pragma("key", format!("'{}'", key.replace('\'', "''")));

    let pool = SqlitePoolOptions::new().max_connections(5).connect_with(private_opts).await?;

    // 验证加密库与密钥是否可用
    query("SELECT count(*) FROM sqlite_master").execute(&pool).await?;
    Ok(pool)
}

/// 写入全局连接池并执行私有表 DDL
async fn store_pool_and_init(pool: SqlitePool) -> Result<(), anyhow::Error> {
    let pool_arc = Arc::new(pool);

    {
        let mut global_pool = GLOBAL_PRIVATE_SQL_POOL.write().await;
        *global_pool = Some(pool_arc.clone());
    }

    {
        let pool_guard = GLOBAL_PRIVATE_SQL_POOL.read().await;
        let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
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
    let uuid = get_user_map("uuid".to_string()).await.expect("获取用户uuid失败");
    let sqlite_path = Path::new(&app_path).join(SQLITE_PATH);

    let db_data_dir = Path::new(&app_path).join(SQLITE_PATH).join(&uuid);
    let db_file_path = Path::new(&app_path).join(SQLITE_PATH).join(&uuid).join(PRIVATE_DB); // 路径拼接

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

    // 不要预创建文件，让 SQLite 的 create_if_missing 自动处理
    db_file_path.to_str().expect("错误的数据库文件").to_string()
}
