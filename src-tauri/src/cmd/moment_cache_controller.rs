//! 动态(朋友圈)列表本地缓存命令。
//!
//! 移动端进入动态页时先读本地缓存（user.db 的 `moment_cache`），无缓存才请求服务端；
//! 有缓存时只有下拉刷新会回源。媒体文件复用 `file_record`（`biz_id` = 动态 uuid），
//! 由前端调用 `get_file_by_biz_id` 预下载落盘。

use log::info;
use serde_json::Value;

use crate::models::entity::moment_cache::{MomentCache, MomentCacheItem};

/// 保存动态列表缓存（按 feed 只保留最近 100 条）。
///
/// `moments` 直接接收前端 `MomentVo` 数组，服务端字段变更无需改表结构。
#[tauri::command]
pub async fn save_moment_cache(feed: String, moments: Vec<Value>) -> Result<usize, String> {
    let feed = feed.trim().to_string();
    if feed.is_empty() {
        return Err("feed 不能为空".to_string());
    }

    let mut items: Vec<MomentCacheItem> = Vec::with_capacity(moments.len());
    for moment in moments {
        let Some(obj) = moment.as_object() else { continue };
        let uuid = obj.get("uuid").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
        if uuid.is_empty() {
            continue;
        }
        let author_uuid =
            obj.get("author_uuid").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let created_at = obj.get("created_at").and_then(|v| v.as_i64()).unwrap_or(0);
        items.push((uuid, author_uuid, created_at, moment.to_string()));
    }

    let written = MomentCache::upsert_many(&feed, &items, MomentCache::MAX_PER_FEED)
        .await
        .map_err(|e| e.to_string())?;
    info!("动态缓存写入完成: feed={}, 条数={}", feed, written);
    Ok(written)
}

/// 读取某个 feed 的动态缓存（按创建时间倒序，最多 100 条）。
///
/// 返回 `MomentVo` 数组；解析失败的脏数据跳过，不影响整体。
#[tauri::command]
pub async fn get_moment_cache(feed: String, limit: Option<i64>) -> Result<Vec<Value>, String> {
    let feed = feed.trim().to_string();
    if feed.is_empty() {
        return Err("feed 不能为空".to_string());
    }
    let limit = limit.unwrap_or(MomentCache::MAX_PER_FEED).clamp(1, MomentCache::MAX_PER_FEED);

    let payloads = MomentCache::list_payloads(&feed, limit).await.map_err(|e| e.to_string())?;
    let mut result = Vec::with_capacity(payloads.len());
    for payload in payloads {
        match serde_json::from_str::<Value>(&payload) {
            Ok(value) => result.push(value),
            Err(e) => info!("跳过无法解析的动态缓存: {}", e),
        }
    }
    Ok(result)
}

/// 删除单条动态缓存（用户删除动态后调用）。
#[tauri::command]
pub async fn delete_moment_cache(uuid: String) -> Result<u64, String> {
    if uuid.trim().is_empty() {
        return Err("uuid 不能为空".to_string());
    }
    MomentCache::delete_by_uuid(uuid.trim()).await.map_err(|e| e.to_string())
}

/// 清空某个 feed 的动态缓存（发布新动态后让「我的」下次强制回源）。
#[tauri::command]
pub async fn clear_moment_cache(feed: String) -> Result<u64, String> {
    let feed = feed.trim().to_string();
    if feed.is_empty() {
        return Err("feed 不能为空".to_string());
    }
    MomentCache::clear_feed(&feed).await.map_err(|e| e.to_string())
}
