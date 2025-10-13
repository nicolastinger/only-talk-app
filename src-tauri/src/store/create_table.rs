use sqlx::SqlitePool;
use crate::GLOBAL_QUIC_USER_INFO;

/// 初始化数据库
pub async fn init_ddl(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    create_chat_record_table(pool_sqlite).await?;
    create_record_state_table(pool_sqlite).await?;
    create_ack_record_table(pool_sqlite).await?;
    create_chat_session_table(pool_sqlite).await?;
    create_file_local_map_table(pool_sqlite).await?;
    create_friend_table(pool_sqlite).await?;
    create_system_notification_table(pool_sqlite).await?;
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

/// 创建已读消息表
pub async fn create_record_state_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS chat_record_read (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
            UNIQUE(send_user, recv_user)
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

/// 创建消息会话表
pub async fn create_chat_session_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS chat_session (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
            text_type INTEGER NOT NULL DEFAULT 0,
            unread_count INTEGER NOT NULL DEFAULT 0,
            last_message TEXT NOT NULL,
            is_show INTEGER NOT NULL DEFAULT 1,
            is_top INTEGER NOT NULL DEFAULT 0,
            session_type INTEGER NOT NULL DEFAULT 0,
            UNIQUE(send_user, recv_user)
        )"#,
    )
        .execute(pool_sqlite)
        .await?;
    Ok(())
}


/// 创建文件本地映射表
pub async fn create_file_local_map_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS file_local_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            file_id TEXT NOT NULL,
            original_file_name TEXT NOT NULL,
            orignal_file_path TEXT NOT NULL,
            file_type INTEGER NOT NULL DEFAULT 0,
            local_file_path TEXT NOT NULL,
            local_file_name TEXT NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )"#,
    )
        .execute(pool_sqlite)
        .await?;
    Ok(())
}

/// 创建用户好友表
pub async fn create_friend_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS friend (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            friend_id TEXT NOT NULL,
            friend_account TEXT NOT NULL,
            friend_name TEXT NOT NULL,
            friend_icon TEXT NOT NULL,
            friend_info TEXT NOT NULL,
            friend_status INTEGER NOT NULL DEFAULT 0,
            me TEXT NOT NULL,
            is_del INTEGER NOT NULL DEFAULT 0,
            is_block INTEGER NOT NULL DEFAULT 0,
            is_mute INTEGER NOT NULL DEFAULT 0,
            is_top INTEGER NOT NULL DEFAULT 0,
            is_show INTEGER NOT NULL DEFAULT 1,
            version INTEGER NOT NULL DEFAULT 0,
            UNIQUE(friend_id, me)
        )"#,
    )
        .execute(pool_sqlite)
        .await?;
    Ok(())
}

/// 创建系统通知消息表
pub async fn create_system_notification_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS system_notification (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            priority INTEGER NOT NULL DEFAULT 0,
            category TEXT NOT NULL DEFAULT 'general'
        )"#,
    )
        .execute(pool_sqlite)
        .await?;
    Ok(())
}
