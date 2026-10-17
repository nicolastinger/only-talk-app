use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant};

use anyhow::anyhow;
use log::{error, info, warn};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::Runtime;

use crate::config::get_config;
use crate::dao::chat_record_db::query_chat_record_by_id_from_db;
use crate::dao::file_record_db::{
    delete_file_record_by_id, delete_file_record_by_pk, increment_download_retry_count,
    insert_failed_file_record, insert_file_record, list_all_files, query_file_record_by_id,
    MAX_DOWNLOAD_RETRY_COUNT,
};
use crate::models::dto::http_result::HttpResult;
use crate::models::entity::chat_record_raw::{ChatRecordRaw, FileRecord as ChatFileRecord};
use crate::models::entity::file_record::FileRecord;
use crate::models::vo::file_vo::{FileVo, LocalFileVo};
use crate::service::api_service::{get_without_token, post_with_body};
use crate::utils::global_static_str::MONTHLY_RESOURCE_PATH;
use crate::utils::{events, uuid_utils};

/// 从nano_id获取聊天记录中的文件名
async fn get_file_name_from_nano_id(nano_id: Option<&str>) -> Option<String> {
    if let Some(nano_id) = nano_id {
        if !nano_id.is_empty() {
            // 尝试获取当前用户UUID
            let uuid = crate::service::user_service::get_user_info("uuid").await.ok()?;
            // 从聊天记录获取raw
            if let Ok(chat_record) = query_chat_record_by_id_from_db(nano_id, &uuid).await {
                // 根据text_type解析raw
                match chat_record.text_type {
                    2 => {
                        // 图片消息
                        if let Ok(image_record) = <crate::models::entity::chat_record_raw::ImageRecord as ChatRecordRaw>::deserialize(&chat_record.raw) {
                            return Some(image_record.file_name);
                        }
                    }
                    3 => {
                        // 文件消息
                        if let Ok(file_record) =
                            <ChatFileRecord as ChatRecordRaw>::deserialize(&chat_record.raw)
                        {
                            return Some(file_record.file_name);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    None
}

pub async fn get_file_by_biz_id_service(
    biz_id: String,
    url: String,
    nano_id: Option<String>,
) -> Result<Vec<FileVo>, anyhow::Error> {
    // 0、从biz业务表获取文件列表id，biz只负责文件业务
    // 校验biz_id是否合规，是否为空，格式为uuid
    if biz_id.is_empty() {
        return Err(anyhow::anyhow!("biz_id不能为空"));
    }
    // 校验biz_id是否为uuid格式
    if !uuid_utils::is_uuid(&biz_id) {
        return Err(anyhow::anyhow!("biz_id格式错误，必须为uuid格式"));
    }

    // 尝试从nano_id获取原始文件名
    let original_file_name_from_raw = get_file_name_from_nano_id(nano_id.as_deref()).await;
    info!("原始文件名: {:?}", original_file_name_from_raw);
    // 1、从本地获取文件记录（仅正常状态）
    let mut file_list = FileRecord::get_by_biz_id(&biz_id).await?;
    // 2、是否存在文件
    if file_list.is_empty() {
        // 2-0 检查是否存在下载失败超过重试上限的记录
        let failed_list = FileRecord::get_by_biz_id_include_failed(&biz_id).await?;
        let has_exceeded_retry = failed_list.iter().any(|f| {
            f.status == Some(3) || f.download_retry_count.unwrap_or(0) >= MAX_DOWNLOAD_RETRY_COUNT
        });
        if has_exceeded_retry {
            return Err(anyhow::anyhow!(
                "文件下载失败次数已达上限({}次)，不再重试",
                MAX_DOWNLOAD_RETRY_COUNT
            ));
        }

        // 2-1 从远程下载文件
        match download_file_by_biz_service(&biz_id, url, original_file_name_from_raw.clone()).await
        {
            Ok(()) => {}
            Err(e) => {
                error!("文件下载失败: biz_id={}, 错误: {}", biz_id, e);
                // 下载失败，查找该biz_id下已有记录并递增重试次数
                let retry_list = FileRecord::get_by_biz_id_include_failed(&biz_id).await?;
                if let Some(record) = retry_list.first() {
                    let file_uuid = record.uuid.clone().unwrap_or_default();
                    if !file_uuid.is_empty() {
                        increment_download_retry_count(&biz_id, &file_uuid).await?;
                    }
                } else {
                    // 首次下载就失败，没有记录，插入一条失败记录用于追踪重试次数
                    let uuid = uuid::Uuid::new_v4().to_string();
                    let now = crate::utils::time::get_now_time_stamp_as_millis().unwrap_or(0);
                    insert_failed_file_record(&biz_id, &uuid, now).await?;
                    increment_download_retry_count(&biz_id, &uuid).await?;
                }
                return Err(e);
            }
        }
        // 2-2 再重新获取文件记录
        file_list = FileRecord::get_by_biz_id(&biz_id).await?;
        // 2-3 如果还是不存在，抛出错误
        if file_list.is_empty() {
            return Err(anyhow::anyhow!("文件不存在"));
        }
    }
    // 3、转换成VO
    let mut result = Vec::<FileVo>::new();
    for file in file_list.into_iter() {
        // 校验物理文件存在(仅检查, 不读取整个文件字节——大文件会撑爆移动端 IPC)
        let path = file.file_path.ok_or(anyhow::anyhow!("文件不存在"))?;
        let file_path = Path::new(&path);
        let meta = fs::metadata(file_path);
        if meta.is_err() || !meta.is_ok_and(|m| m.is_file()) {
            // 文件不存在
            error!("文件不存在: {:?}", file_path);
            // 递增下载重试次数
            let file_id = file.uuid.clone().ok_or(anyhow::anyhow!("文件不存在"))?;
            let retry_count = increment_download_retry_count(&biz_id, &file_id).await?;
            if retry_count >= MAX_DOWNLOAD_RETRY_COUNT {
                // 超过重试上限，删除文件记录
                delete_file_record_by_id(&biz_id, &file_id).await?;
                return Err(anyhow::anyhow!(
                    "文件下载失败次数已达上限({}次)，不再重试",
                    MAX_DOWNLOAD_RETRY_COUNT
                ));
            }
            return Err(anyhow::anyhow!("文件不存在，等待重试"));
        }
        // 优先使用nano_id对应的raw中的文件名，否则使用数据库中的文件名
        let final_file_name = original_file_name_from_raw
            .clone()
            .unwrap_or_else(|| file.file_name.clone().unwrap_or_default());
        let file_vo = FileVo {
            file_id: file.uuid,
            file_hash: file.file_hash,
            created_at: file.created_at,
            updated_at: file.updated_at,
            created_by: None,
            updated_by: None,
            status: file.status,
            file_extension: None,
            mime_type: file.mime_type,
            description: None,
            original_file_name: Some(final_file_name),
            original_file_path: None,
            absolute_file_path: Some(file_path.to_string_lossy().to_string()),
            raw: None,
            size: file.file_size,
            is_del: Some(0),
        };
        info!("通过业务id获取公开文件成功: {:?}", file_vo.absolute_file_path);
        result.push(file_vo);
    }

    Ok(result)
}

/**
 * 判断本地是否已存在该业务文件（只查本地记录 + 物理文件，不触发远程下载）
 */
pub async fn has_local_chat_file_service(biz_id: &str) -> Result<bool, anyhow::Error> {
    if biz_id.is_empty() {
        return Ok(false);
    }
    let file_list = FileRecord::get_by_biz_id(biz_id).await?;
    for file in file_list.into_iter() {
        if let Some(path) = file.file_path {
            if Path::new(&path).is_file() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

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
pub async fn download_file_by_biz_service(
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

// 从Content-Disposition头部提取文件名
fn extract_filename_from_content_disposition(content_disposition: &str) -> Option<String> {
    if content_disposition.is_empty() {
        return None;
    }

    // 查找filename参数
    let filename_start = content_disposition.find("filename=").map(|i| i + 9)?; // "filename="长度为9
    let filename_part = &content_disposition[filename_start..];

    // 处理引号包围的文件名
    let filename = if filename_part.starts_with('"') && filename_part.ends_with('"') {
        filename_part[1..filename_part.len() - 1].to_string()
    } else {
        filename_part.split_whitespace().next()?.to_string()
    };

    Some(filename)
}

/// 从下载 URL 的路径段推断扩展名(对象 key 形如 `<uuid>.<ext>`, 可能带预签名查询串)
fn extract_ext_from_url(url: &str) -> Option<String> {
    let no_query = url.split(['?', '#']).next().unwrap_or(url);
    let last_segment = no_query.rsplit('/').next().unwrap_or("");
    let ext = last_segment.rsplit_once('.').map(|(_, ext)| ext)?;
    if ext.is_empty() || ext.contains('=') {
        None
    } else {
        Some(ext.to_lowercase())
    }
}

/// 由响应 Content-Type 推断扩展名(兜底, 仅覆盖常见图片类型)
fn extract_ext_from_mime(mime: &str) -> Option<String> {
    let essence = mime.split(';').next().unwrap_or("").trim().to_lowercase();
    let ext = match essence.as_str() {
        "image/webp" => "webp",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        "image/tiff" => "tiff",
        "image/avif" => "avif",
        "image/heic" => "heic",
        _ => return None,
    };
    Some(ext.to_string())
}

// ===== 文件管理（本地 file_record 列表 / 筛选 / 排序 / 删除）=====

/// 文件分类: image / video / audio / document / archive / other
pub fn classify_file_type(file_name: &str, mime_type: &str) -> &'static str {
    let ext =
        Path::new(file_name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" | "heic" | "heif"
        | "avif" => "image",
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" | "m4v" | "ts" | "3gp" => "video",
        "mp3" | "wav" | "m4a" | "aac" | "ogg" | "flac" | "opus" | "wma" | "amr" => "audio",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "csv" | "rtf"
        | "epub" => "document",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" | "cab" => "archive",
        _ => {
            // 扩展名无法识别时按 MIME 兜底
            let mime = mime_type.to_lowercase();
            if mime.starts_with("image/") {
                "image"
            } else if mime.starts_with("video/") {
                "video"
            } else if mime.starts_with("audio/") {
                "audio"
            } else {
                "other"
            }
        }
    }
}

/// 获取本地文件列表（仅 status=0 且物理文件存在的记录）
/// - `file_type`: 分类过滤, 空/全部不过滤
/// - `sort_by`: "name"(文件名) 或 "date"(创建时间), 默认 date
/// - `sort_order`: "asc" / "desc", 默认 desc
pub async fn get_local_file_list_service(
    file_type: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<LocalFileVo>, anyhow::Error> {
    let records = list_all_files().await?;
    let mut list = Vec::<LocalFileVo>::new();

    for record in records {
        let Some(file_name) = record.file_name else { continue };
        if file_name.is_empty() {
            continue; // 下载失败占位记录无文件名, 跳过
        }
        let Some(file_path) = record.file_path else { continue };
        // 仅管理仍存在的物理文件（文件被外部删除时不再展示）
        if !Path::new(&file_path).is_file() {
            continue;
        }
        let category = classify_file_type(&file_name, record.mime_type.as_deref().unwrap_or(""));
        if let Some(filter) = file_type.as_deref() {
            if !filter.is_empty() && filter != category {
                continue;
            }
        }
        let ext =
            Path::new(&file_name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        list.push(LocalFileVo {
            id: record.id.unwrap_or(0),
            biz_id: record.biz_id.unwrap_or_default(),
            uuid: record.uuid.unwrap_or_default(),
            file_name,
            file_path,
            file_size: record.file_size.unwrap_or(0),
            mime_type: record.mime_type.unwrap_or_default(),
            created_at: record.created_at.unwrap_or(0),
            file_type: category.to_string(),
            ext,
        });
    }

    match sort_by.as_deref() {
        Some("name") => {
            list.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()))
        }
        _ => list.sort_by(|a, b| a.created_at.cmp(&b.created_at)),
    }
    // 默认降序；显式传 asc 才升序
    if sort_order.as_deref() != Some("asc") {
        list.reverse();
    }

    Ok(list)
}

/// 删除本地文件（删物理文件 + 删 file_record 记录）
pub async fn delete_local_file_service(id: i64) -> Result<(), anyhow::Error> {
    let record = query_file_record_by_id(id).await?.ok_or_else(|| anyhow!("文件记录不存在"))?;

    if let Some(path) = record.file_path {
        if !path.trim().is_empty() {
            let path_ref = Path::new(&path);
            if path_ref.is_file() {
                if let Err(e) = std::fs::remove_file(path_ref) {
                    error!("删除物理文件失败: {} err={}", path, e);
                    return Err(anyhow!("删除物理文件失败: {}", e));
                }
                info!("物理文件已删除: {}", path);
            }
        }
    }

    delete_file_record_by_pk(id).await?;
    Ok(())
}

/// 打开本地文件（跨平台）
/// - 桌面: 直接交给系统默认程序打开
/// - Android: 复制到 cache 目录后交给 tauri-plugin-view，
///   由插件经 FileProvider 生成 content:// URI 并带 FLAG_GRANT_READ_URI_PERMISSION
///   打开（opener 插件移动端不支持打开文件且缺 URI 授权）
pub async fn open_local_file_service<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    if path.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    let file_path = Path::new(&path);
    if !file_path.is_file() {
        warn!("文件不存在: {}", path);
        return Err(format!("文件不存在: {}", path));
    }

    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        // Android: 复制到 cache/open 目录后交给 view 插件打开,
        // 复用 manifest 声明的 ${applicationId}.fileprovider + file_paths.xml 的 cache-path
        let cache_dir = app.path().cache_dir().map_err(|e| format!("获取缓存目录失败: {}", e))?;
        let open_dir = cache_dir.join("open");
        fs::create_dir_all(&open_dir).map_err(|e| format!("创建打开目录失败: {}", e))?;

        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "无法获取文件名".to_string())?;

        // 目标文件已存在则跳过复制(同名文件复用)
        let dest = open_dir.join(file_name);
        if !dest.is_file() {
            fs::copy(file_path, &dest).map_err(|e| format!("复制文件到缓存失败: {}", e))?;
        }

        info!("Android 打开文件: {:?}", dest);
        use tauri_plugin_view::ViewExt;
        app.view()
            .view(tauri_plugin_view::ViewRequest {
                path: Some(dest.to_string_lossy().into_owned()),
            })
            .map_err(|e| {
                error!("Android 打开文件失败: {}", e);
                e.to_string()
            })?;
        Ok(())
    }

    #[cfg(not(target_os = "android"))]
    {
        use tauri_plugin_opener::OpenerExt;

        info!("打开本地文件: {}", path);
        app.opener().open_path(path, None::<String>).map_err(|e| {
            error!("打开文件失败: {}", e);
            e.to_string()
        })
    }
}
