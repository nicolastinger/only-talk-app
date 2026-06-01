use anyhow::Error;
use log::info;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::get_db_client;
use crate::dao::store::SqliteStore;

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
        sqlx::query(r#"INSERT OR IGNORE INTO system_notification (id, title, content, created_at, content_type, user_id, biz_id, is_read,  level1, level2, level3, level4, unread_count, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?)"#)
            .bind(&system_notification.id)
            .bind(&system_notification.title)
            .bind(&system_notification.content)
            .bind(system_notification.created_at)
            .bind(system_notification.content_type)
            .bind(&system_notification.user_id)
            .bind(&system_notification.biz_id)
            .bind(system_notification.is_read)
            .bind(system_notification.level1)
            .bind(system_notification.level2)
            .bind(system_notification.level3)
            .bind(system_notification.level4)
            .bind(system_notification.unread_count)
            .bind(system_notification.priority)
            .execute(&pool_sqlite)
            .await?;
        Ok(())
    }

    /// 获取已读/未读/所有系统通知
    pub async fn find_all_by_is_read(
        user_id: &str,
        is_read: Option<i32>,
    ) -> Result<Vec<SystemNotification>, anyhow::Error> {
        let pool_sqlite = get_db_client().await?;
        let system_notification = sqlx::query_as::<_, SystemNotification>(
            r#"SELECT * FROM system_notification WHERE user_id = ? and (? is null or is_read = ?)"#,
        )
        .bind(user_id)
        .bind(is_read)
        .bind(is_read)
        .fetch_all(&pool_sqlite)
        .await?;
        Ok(system_notification)
    }

    /// 批量已读系统通知
    pub async fn batch_read(user_id: &str, ids: Vec<String>) -> Result<i32, anyhow::Error> {
        info!("批量已读系统通知，user_id: {}, ids: {:?}", user_id, ids);
        // 检查ids是否为空
        if ids.is_empty() {
            return Ok(0);
        }
        let pool_sqlite = get_db_client().await?;

        // 构建 IN 查询的占位符
        let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
        let placeholders_str = placeholders.join(",");

        // 更新未读的系统消息为已读，并返回更新的行数
        let query_str = format!(
            "UPDATE system_notification SET is_read = 1 WHERE user_id = ? AND biz_id IN ({}) AND is_read = 0",
            placeholders_str
        );

        let mut query = sqlx::query(&query_str).bind(user_id);
        for id in &ids {
            query = query.bind(id);
        }

        let result = query.execute(&pool_sqlite).await?;
        let effect_row = result.rows_affected() as i32;

        info!("批量已读系统通知完成，user_id: {}, effect_row: {}", user_id, effect_row);

        Ok(effect_row)
    }

    /// 按层级条件批量清除未读通知
    /// level 参数传 -1 表示通配（匹配该层级所有值）
    pub async fn clear_unread_by_level(
        user_id: &str,
        level1: i32,
        level2: i32,
        level3: i32,
        level4: i32,
    ) -> Result<i32, anyhow::Error> {
        info!(
            "按层级清除未读通知，user_id: {}, level1: {}, level2: {}, level3: {}, level4: {}",
            user_id, level1, level2, level3, level4
        );
        let pool_sqlite = get_db_client().await?;

        let mut conditions = vec!["user_id = ?".to_string(), "is_read = 0".to_string()];
        if level1 != -1 {
            conditions.push("level1 = ?".to_string());
        }
        if level2 != -1 {
            conditions.push("level2 = ?".to_string());
        }
        if level3 != -1 {
            conditions.push("level3 = ?".to_string());
        }
        if level4 != -1 {
            conditions.push("level4 = ?".to_string());
        }

        let where_clause = conditions.join(" AND ");
        let sql = format!("UPDATE system_notification SET is_read = 1 WHERE {}", where_clause);

        let mut query = sqlx::query(&sql).bind(user_id);
        if level1 != -1 {
            query = query.bind(level1);
        }
        if level2 != -1 {
            query = query.bind(level2);
        }
        if level3 != -1 {
            query = query.bind(level3);
        }
        if level4 != -1 {
            query = query.bind(level4);
        }

        let result = query.execute(&pool_sqlite).await?;
        let effect_row = result.rows_affected() as i32;
        info!("按层级清除未读通知完成，user_id: {}, effect_row: {}", user_id, effect_row);

        Ok(effect_row)
    }

    /// 一键清空所有未读通知
    pub async fn clear_all_unread(user_id: &str) -> Result<(), anyhow::Error> {
        info!("清空所有未读通知，user_id: {}", user_id);
        let pool_sqlite = get_db_client().await?;
        sqlx::query(
            "UPDATE system_notification SET is_read = 1 WHERE user_id = ? AND is_read = 0",
        )
        .bind(user_id)
        .execute(&pool_sqlite)
        .await?;
        Ok(())
    }
}

impl SqliteStore for SystemNotification {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS system_notification (
            id TEXT PRIMARY KEY,
            title TEXT,
            content TEXT,
            created_at INTEGER,
            content_type INTEGER,
            user_id TEXT,
            biz_id TEXT,
            is_read INTEGER,
            level1 INTEGER,
            level2 INTEGER,
            level3 INTEGER,
            level4 INTEGER,
            unread_count INTEGER,
            priority INTEGER NOT NULL DEFAULT 0
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        // 创建索引
        sqlx::query(
            r#"CREATE INDEX IF NOT EXISTS idx_system_notification_user_id_created_at ON system_notification(user_id, created_at)"#
        )
            .execute(pool_sqlite)
            .await?;

        sqlx::query(
            r#"CREATE INDEX IF NOT EXISTS idx_system_notification_is_read ON system_notification(is_read)"#
        )
            .execute(pool_sqlite)
            .await?;

        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}
