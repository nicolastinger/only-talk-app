//! 从远程按业务 id 下载文件(流式落盘 + SHA-256 + 进度上报)。

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant};

use anyhow::anyhow;
use log::info;
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::mime::{
    extract_ext_from_mime, extract_ext_from_url, extract_filename_from_content_disposition,
};
use crate::config::get_config;
use crate::dao::file_record_db::insert_file_record;
use crate::models::dto::http_result::HttpResult;
use crate::service::api_service::{get_without_token, post_with_body};
use crate::utils::events;
use crate::utils::global_static_str::MONTHLY_RESOURCE_PATH;

/// 聊天文件下载进度事件负载(事件名 `chat_file_download_progress`)。
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatFileDownloadProgress {
    biz_id: String,
    file_name: String,
    downloaded: u64,
    total: u64,
}

/// 上报聊天文件下载进度(前端按 bizId 匹配对应消息; 前端未就绪时静默忽略)。
fn emit_chat_file_progress(biz_id: &str, file_name: &str, downloaded: u64, total: u64) {
    let _ = events::emit(
        "chat_file_download_progress",
        ChatFileDownloadProgress {
            biz_id: biz_id.to_string(),
            file_name: file_name.to_string(),
            downloaded,
            total,
        },
    );
}

/**
 * 通过业务id下载文件
 * @param biz_id 业务ID
 * @param url 下载URL
 * @param original_file_name_from_raw 可选的原始文件名（从消息raw中获取），用于确定扩展名
 */
pub(super) async fn download_file_by_biz_service(
    biz_id: &str,
    url: String,
    original_file_name_from_raw: Option<String>,
) -> Result<(), anyhow::Error> {
    // 1、 从远程获取文件下载url
    info!("获取文件下载URL: {}", url);

    // 创建一个空的请求体
    let params = HashMap::new();

    // 发送POST请求
    let response = post_with_body(url, params).await?;

    // 检查响应状态码
    if !response.status().is_success() {
        return Err(anyhow!("请求失败: {}", response.status()));
    }
    // 2、提取下载url
    let result: HttpResult = response.json().await?;
    // 获取下载url数组
    if let Value::Array(items) = result.data {
        info!("获取到文件URL列表: {:?}", items);
        // 3、遍历文件ID列表，下载每个文件
        for item in items.into_iter() {
            // 兼容旧版(URL 字符串)与新版({ url, file_name, mime_type })
            let (file_url_str, server_file_name, server_mime) = match item {
                Value::String(url) => (url, None, None),
                Value::Object(map) => {
                    let url = match map.get("url").and_then(|v| v.as_str()) {
                        Some(u) => u.to_string(),
                        None => continue,
                    };
                    let name = map.get("file_name").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let mime = map.get("mime_type").and_then(|v| v.as_str()).map(|s| s.to_string());
                    (url, name, mime)
                }
                _ => continue,
            };
            {
                info!("下载文件URL: {}", file_url_str);
                // 对象 key 形如 `<uuid>.<ext>`, 先从 URL 路径取出扩展名备用(get_without_token 会消费 url)
                let url_ext = extract_ext_from_url(&file_url_str);

                let response = get_without_token(file_url_str).await?;

                if !response.status().is_success() {
                    return Err(anyhow!("文件下载失败: HTTP {}", response.status()));
                }

                // 总大小: 优先响应头 Content-Length(预签名 URL 通常带), 未知则为 0
                let total = response.content_length().unwrap_or(0);

                // 首先提取必要的header值，因为一旦开始流式读取后就无法再访问headers
                let mut content_type = response
                    .headers()
                    .get("content-type")
                    .and_then(|ct| ct.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                // 响应头缺失时回退服务端返回的 mime
                if content_type.is_empty() {
                    if let Some(mime) = server_mime.as_ref() {
                        content_type = mime.clone();
                    }
                }

                // 提取Content-Disposition头信息
                let content_disposition = response
                    .headers()
                    .get("content-disposition")
                    .and_then(|cd| cd.to_str().ok())
                    .unwrap_or("")
                    .to_string();

                // 获取原始文件名（优先级：1.服务端返回 2.raw中的文件名 3.Content-Disposition头）
                let original_file_name = server_file_name
                    .clone()
                    .filter(|n| !n.trim().is_empty())
                    .or_else(|| original_file_name_from_raw.clone())
                    .or_else(|| extract_filename_from_content_disposition(&content_disposition));

                // 扩展名来源优先级: 原始文件名 > 下载URL路径 > 响应 Content-Type
                // (头像等 biz 文件既无 raw 名也无 Content-Disposition, 不能再用兜底名推断, 否则会误落 .tmp)
                let mut ext = original_file_name
                    .as_deref()
                    .and_then(|name| Path::new(name).extension())
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if ext.is_empty() {
                    ext = url_ext.clone().unwrap_or_default();
                }
                if ext.is_empty() {
                    ext = extract_ext_from_mime(&content_type).unwrap_or_default();
                }

                // 进度事件/展示用名称(raw 缺失时用业务id兜底)
                let display_name = original_file_name.clone().unwrap_or_else(|| {
                    format!("file_{}.{}", biz_id, if ext.is_empty() { "tmp" } else { &ext })
                });

                // 创建uuid_v4作为文件名，但保留扩展名
                let uuid = uuid::Uuid::new_v4().to_string();
                let file_name = if !ext.is_empty() {
                    format!("{}.{}", uuid, ext)
                } else {
                    // 仍无法确定扩展名时兜底 .tmp
                    format!("{}.tmp", uuid)
                };
                let resource_path =
                    get_config(MONTHLY_RESOURCE_PATH).ok_or(anyhow!("无法获取当月资源路径"))?;

                // 构建文件路径
                let file_path = format!("{}/{}", resource_path, file_name);
                info!("文件保存路径: {}", file_path);

                // 流式下载: 边写盘边增量计算 SHA-256, 并按需上报进度
                let mut file = fs::File::create(&file_path)?;
                let mut hasher = Sha256::new();
                let mut downloaded: u64 = 0;
                let mut last_emit = Instant::now();
                let mut response = response;

                while let Some(chunk) = response.chunk().await? {
                    file.write_all(&chunk)?;
                    hasher.update(&chunk);
                    downloaded += chunk.len() as u64;
                    // 节流: 最快每 100ms 上报一次, 避免高频事件
                    if last_emit.elapsed() >= Duration::from_millis(100) {
                        emit_chat_file_progress(biz_id, &display_name, downloaded, total);
                        last_emit = Instant::now();
                    }
                }
                file.flush()?;
                // 完成时补发最终进度
                emit_chat_file_progress(biz_id, &display_name, downloaded, total);

                // 计算文件哈希值
                let file_hash = format!("{:x}", hasher.finalize());
                info!("文件已保存到: {}, 大小: {} bytes", file_path, downloaded);

                // 插入文件记录到数据库
                insert_file_record(
                    biz_id,
                    &uuid,
                    &file_name,
                    &file_path,
                    downloaded as i64,
                    &content_type,
                    &file_hash,
                )
                .await?;
            }
        }
    }

    // 2、 如果返回文件列表，传递biz_id和file_id循环请求插入
    Ok(())
}
