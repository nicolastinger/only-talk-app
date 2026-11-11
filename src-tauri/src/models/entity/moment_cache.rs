use anyhow::Error;
use log::info;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::models::entity::store::SqliteStore;
use crate::utils::db::get_db_client;

/// 动态(朋友圈)本地缓存表。
///
/// 按 `feed`(plaza/following/mine) 缓存动态列表项的原始 JSON(`payload`)，
/// 每个 feed 只保留最近 [`MomentCache::MAX_PER_FEED`] 条；冷启动/首屏进入动态时
/// 优先读这里，避免每次都请求服务端。
///
/// 动态图片等媒体文件不存本表：复用 `file_record`（`biz_id` = 动态 uuid），
/// 由前端预下载后落盘，离线时可直接按 `biz_id` 取到本地路径。
#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct MomentCache {
    /// 主键ID
    pub id: Option<i64>,
    /// 动态 uuid（同一动态可能出现在多个 feed，故唯一键为 feed + uuid）
    pub uuid: Option<String>,
    /// 来源 feed：plaza / following / mine
    pub feed: Option<String>,
    /// 作者 uuid（便于后续按作者清理/统计）
    pub author_uuid: Option<String>,
    /// 动态列表项原始 JSON（与前端 `MomentVo` 一致，字段变更无需改表）
    pub payload: Option<String>,
    /// 动态创建时间（毫秒，排序用）
    pub created_at: Option<i64>,
    /// 本地写入缓存时间（毫秒）
    pub cached_at: Option<i64>,
}

/// 单条待写入缓存：(uuid, author_uuid, created_at, payload)
pub type MomentCacheItem = (String, String, i64, String);

impl SqliteStore for MomentCache {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        info!("创建动态缓存表...");
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS moment_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT NOT NULL,
                feed TEXT NOT NULL,
                author_uuid TEXT,
                payload TEXT NOT NULL,
                created_at INTEGER DEFAULT 0,
                cached_at INTEGER DEFAULT 0,
                UNIQUE(feed, uuid)
                )"#,
        )
        .execute(pool_sqlite)
        .await?;
        sqlx::query(
            r#"CREATE INDEX IF NOT EXISTS idx_moment_cache_feed_created
               ON moment_cache (feed, created_at DESC, id DESC)"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        // 首版无迁移；后续字段变更在此补 ALTER TABLE(参考 file_record)
        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}

impl MomentCache {
    /// 每个 feed 最多缓存的动态条数
    pub const MAX_PER_FEED: i64 = 100;

    /// 批量写入/更新缓存，并按 `keep` 裁剪为最近若干条。
    ///
    /// 返回实际写入条数；`feed` 为空直接返回 0。
    pub async fn upsert_many(
        feed: &str,
        items: &[MomentCacheItem],
        keep: i64,
    ) -> Result<usize, Error> {
        let feed = feed.trim();
        if feed.is_empty() || items.is_empty() {
            return Ok(0);
        }
        let pool_sqlite = get_db_client().await?;
        let now = crate::utils::time::get_now_time_stamp_as_millis().unwrap_or(0);

        let mut written = 0usize;
        for (uuid, author_uuid, created_at, payload) in items {
            sqlx::query(
                r#"INSERT INTO moment_cache (uuid, feed, author_uuid, payload, created_at, cached_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(feed, uuid) DO UPDATE SET
                     author_uuid = excluded.author_uuid,
                     payload = excluded.payload,
                     created_at = excluded.created_at,
                     cached_at = excluded.cached_at"#,
            )
            .bind(uuid)
            .bind(feed)
            .bind(author_uuid)
            .bind(payload)
            .bind(created_at)
            .bind(now)
            .execute(&pool_sqlite)
            .await?;
            written += 1;
        }

        Self::trim_with_pool(&pool_sqlite, feed, keep).await?;
        Ok(written)
    }

    /// 按动态创建时间倒序读取某个 feed 的缓存 payload。
    pub async fn list_payloads(feed: &str, limit: i64) -> Result<Vec<String>, Error> {
        let pool_sqlite = get_db_client().await?;
        let rows = sqlx::query_scalar::<_, String>(
            r#"SELECT payload FROM moment_cache WHERE feed = ?
               ORDER BY created_at DESC, id DESC LIMIT ?"#,
        )
        .bind(feed)
        .bind(limit)
        .fetch_all(&pool_sqlite)
        .await?;
        Ok(rows)
    }

    /// 删除单条动态缓存（用户删除自己的动态后调用，避免重启后又出现）。
    pub async fn delete_by_uuid(uuid: &str) -> Result<u64, Error> {
        let pool_sqlite = get_db_client().await?;
        let result = sqlx::query(r#"DELETE FROM moment_cache WHERE uuid = ?"#)
            .bind(uuid)
            .execute(&pool_sqlite)
            .await?;
        Ok(result.rows_affected())
    }

    /// 清空某个 feed 的缓存（如发布新动态后让「我的」下次强制回源）。
    pub async fn clear_feed(feed: &str) -> Result<u64, Error> {
        let pool_sqlite = get_db_client().await?;
        let result = sqlx::query(r#"DELETE FROM moment_cache WHERE feed = ?"#)
            .bind(feed)
            .execute(&pool_sqlite)
            .await?;
        Ok(result.rows_affected())
    }

    /// 某个 feed 当前缓存条数（测试/调试用）。
    pub async fn count(feed: &str) -> Result<i64, Error> {
        let pool_sqlite = get_db_client().await?;
        let count =
            sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM moment_cache WHERE feed = ?"#)
                .bind(feed)
                .fetch_one(&pool_sqlite)
                .await?;
        Ok(count)
    }

    /// 只保留最近 `keep` 条（created_at 倒序，同时间按写入顺序）。
    async fn trim_with_pool(pool_sqlite: &SqlitePool, feed: &str, keep: i64) -> Result<(), Error> {
        if keep <= 0 {
            return Ok(());
        }
        sqlx::query(
            r#"DELETE FROM moment_cache
               WHERE feed = ? AND uuid NOT IN (
                 SELECT uuid FROM moment_cache WHERE feed = ?
                 ORDER BY created_at DESC, id DESC LIMIT ?
               )"#,
        )
        .bind(feed)
        .bind(feed)
        .bind(keep)
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }
}
