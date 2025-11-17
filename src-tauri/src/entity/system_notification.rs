use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::store::get_db_client;

/// 系统通知
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SystemNotification {
    pub id: Option<String>,
    /// 通知标题
    pub title: Option<String>,
    /// 详细内容
    pub content: Option<String>,
    /// 创建时间
    pub created_at: Option<i64>,
    /// 内容类型，0-纯文本，1-json, 2-xml
    pub content_type: Option<u16>,
    /// 接收人
    pub user_id: Option<String>,
    /// 是否已读
    pub is_read: Option<bool>,
    /// 业务id
    pub biz_id: Option<String>,

    /// 第一层级，用于定位功能大类
    pub level1: Option<i32>,
    /// 第二层级，用于定位子功能模块
    pub level2: Option<i32>,
    /// 第三层级，用于定位具体功能组
    pub level3: Option<i32>,
    /// 第四层级，用于定位详细功能项
    pub level4: Option<i32>,
    /// 未读数量
    pub unread_count: Option<i32>,
    /// 通知优先级
    pub priority: Option<i32>,
}

impl SystemNotification {
    /// 插入系统通知
    pub async fn insert(system_notification: &SystemNotification) -> Result<(), anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        sqlx::query(r#"INSERT INTO system_notification (id, title, content, created_at, content_type, user_id, is_read,  level1, level2, level3, level4, unread_count, timestamp, is_deleted, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#)
            .bind(&system_notification.id)
            .bind(&system_notification.title)
            .bind(&system_notification.content)
            .bind(&system_notification.created_at)
            .bind(&system_notification.content_type)
            .bind(&system_notification.user_id)
            .bind(&system_notification.is_read)
            .bind(&system_notification.level1)
            .bind(&system_notification.level2)
            .bind(&system_notification.level3)
            .bind(&system_notification.level4)
            .bind(&system_notification.unread_count)
            .bind(&(system_notification.created_at.unwrap_or(0)))
            .bind(&0) // is_deleted 默认为 0
            .bind(&system_notification.priority)
            .execute(&pool_sqlite)
            .await?;
        Ok(())
    }

    /// 获取已读/未读/所有系统通知
    pub async fn find_all_by_is_read(user_id: &str, is_read: Option<bool>) -> Result<Vec<SystemNotification>, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let system_notification = sqlx::query_as::<_, SystemNotification>(r#"SELECT * FROM system_notification WHERE user_id = ? and (? is null or is_read = ?)"#)
            .bind(user_id)
            .bind(is_read)
            .fetch_all(&pool_sqlite)
            .await?;
        Ok(system_notification)
    }
}