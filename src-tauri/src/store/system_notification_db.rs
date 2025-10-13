// 系统通知消息数据库操作

use crate::store::get_db_client;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SystemNotification {
    pub id: i64,
    pub nano_id: String,
    pub title: String,
    pub content: String,
    pub timestamp: i64,
    pub is_read: i32,
    pub is_deleted: i32,
    pub priority: i32,
    pub category: String,
}

impl SystemNotification {
    pub fn new(nano_id: String, title: String, content: String, timestamp: i64) -> Self {
        Self {
            id: 0,
            nano_id,
            title,
            content,
            timestamp,
            is_read: 0,
            is_deleted: 0,
            priority: 0,
            category: "general".to_string(),
        }
    }
}

/// 插入系统通知
pub async fn insert_system_notification(notification: &SystemNotification) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(r#"INSERT INTO system_notification (nano_id, title, content, timestamp, is_read, is_deleted, priority, category) 
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#)
        .bind(&notification.nano_id)
        .bind(&notification.title)
        .bind(&notification.content)
        .bind(notification.timestamp)
        .bind(notification.is_read)
        .bind(notification.is_deleted)
        .bind(notification.priority)
        .bind(&notification.category)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 标记系统通知为已读
pub async fn mark_notification_as_read(nano_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(r#"UPDATE system_notification SET is_read = 1 WHERE nano_id = ?1"#)
        .bind(nano_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 标记系统通知为已删除
pub async fn mark_notification_as_deleted(nano_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(r#"UPDATE system_notification SET is_deleted = 1 WHERE nano_id = ?1"#)
        .bind(nano_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 获取未读系统通知数量
pub async fn get_unread_notification_count() -> Result<i64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let result: (i64,) = sqlx::query_as(r#"SELECT COUNT(*) FROM system_notification WHERE is_read = 0 AND is_deleted = 0"#)
        .fetch_one(&pool_sqlite)
        .await?;
    Ok(result.0)
}

/// 获取系统通知列表（分页）
pub async fn get_notification_list(page: i64, page_size: i64) -> Result<Vec<SystemNotification>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let offset = page * page_size;
    let records = sqlx::query_as::<_, SystemNotification>(
        r#"SELECT id, nano_id, title, content, timestamp, is_read, is_deleted, priority, category 
           FROM system_notification 
           WHERE is_deleted = 0 
           ORDER BY timestamp DESC 
           LIMIT ?1 OFFSET ?2"#
    )
        .bind(page_size)
        .bind(offset)
        .fetch_all(&pool_sqlite)
        .await?;
    Ok(records)
}

/// 获取所有未读系统通知
pub async fn get_unread_notifications() -> Result<Vec<SystemNotification>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let records = sqlx::query_as::<_, SystemNotification>(
        r#"SELECT id, nano_id, title, content, timestamp, is_read, is_deleted, priority, category 
           FROM system_notification 
           WHERE is_read = 0 AND is_deleted = 0 
           ORDER BY timestamp DESC"#
    )
        .fetch_all(&pool_sqlite)
        .await?;
    Ok(records)
}