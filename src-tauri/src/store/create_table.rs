use sqlx::SqlitePool;
use crate::GLOBAL_QUIC_USER_INFO;

/// 初始化数据库
pub async fn init_ddl(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    create_chat_record_table(pool_sqlite).await?;
    create_record_state_table(pool_sqlite).await?;
    create_ack_record_table(pool_sqlite).await?;

    {
        // 本地存储初始化成功
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("store_init".to_string(), "1".to_string());
    }
    Ok(())
}

/// 创建聊天记录表
pub async fn create_chat_record_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS chat_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
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

/// 创建消息记录表
pub async fn create_record_state_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS chat_record_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
            state INTEGER NOT NULL DEFAULT 0
        )"#,
    )
    .execute(pool_sqlite)
    .await?;
    Ok(())
}

/// 创建消息ack表
pub async fn create_ack_record_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS chat_record_ack (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
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
