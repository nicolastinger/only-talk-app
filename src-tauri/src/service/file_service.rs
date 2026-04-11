use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;

use anyhow::anyhow;
use log::{error, info};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::config::get_config;
use crate::dao::file_record_db::{delete_file_record_by_id, increment_download_retry_count, insert_failed_file_record, insert_file_record, MAX_DOWNLOAD_RETRY_COUNT};
use crate::dao::chat_record_db::query_chat_record_by_id_from_db;
use crate::dto::http_result::HttpResult;
use crate::entity::chat_record_raw::{FileRecord as ChatFileRecord, ChatRecordRaw};
use crate::entity::file_record::FileRecord;
use crate::service::api_service::{get_with_token, post_with_body};
use crate::utils::global_static_str::{MONTHLY_RESOURCE_PATH, TALK_API};
use crate::utils::uuid_utils;
use crate::vo::file_vo::FileVo;

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
                        if let Ok(image_record) = <crate::entity::chat_record_raw::ImageRecord as ChatRecordRaw>::deserialize(&chat_record.raw) {
                            return Some(image_record.file_name);
                        }
                    }
                    3 => {
                        // 文件消息
                        if let Ok(file_record) = <ChatFileRecord as ChatRecordRaw>::deserialize(&chat_record.raw) {
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
        match download_file_by_biz_service(&biz_id, url, original_file_name_from_raw.clone()).await {
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
                    let now = chrono::Local::now().timestamp();
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
        // 添加文件数据读取
        let path = file.file_path.ok_or(anyhow::anyhow!("文件不存在"))?;
        let file_path = Path::new(&path);
        let raw = fs::read(file_path);
        if raw.is_err() {
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
        let final_file_name = original_file_name_from_raw.clone().unwrap_or_else(|| file.file_name.clone().unwrap_or_default());
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
            raw: Some(raw?),
            size: file.file_size,
            is_del: Some(0),
        };
        info!("通过业务id获取公开文件成功: {:?}", file_vo.absolute_file_path);
        result.push(file_vo);
    }

    Ok(result)
}

/**
 * 通过业务id下载文件
 * @param biz_id 业务ID
 * @param url 下载URL
 * @param original_file_name_from_raw 可选的原始文件名（从消息raw中获取），用于确定扩展名
 */
pub async fn download_file_by_biz_service(biz_id: &str, url: String, original_file_name_from_raw: Option<String>) -> Result<(), anyhow::Error> {
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
    if let Value::Array(file_urls) = result.data {
        info!("获取到文件URL列表: {:?}", file_urls);
        // 3、遍历文件ID列表，下载每个文件
        for file_url in file_urls.into_iter() {
            if let Value::String(file_url_str) = file_url {
                let file_url_str = format!("{}", file_url_str);
                info!("下载文件URL: {}", file_url_str);

                let response = get_with_token(file_url_str).await?;

                // 首先提取必要的header值，因为一旦使用bytes()方法后就无法再访问headers
                let content_type = response
                    .headers()
                    .get("content-type")
                    .and_then(|ct| ct.to_str().ok())
                    .unwrap_or("")
                    .to_string();

                // 提取Content-Disposition头信息
                let content_disposition = response
                    .headers()
                    .get("content-disposition")
                    .and_then(|cd| cd.to_str().ok())
                    .unwrap_or("")
                    .to_string();

                // 处理二进制响应
                let binary_data = response.bytes().await?;
                info!("获取到二进制数据，大小: {} bytes", binary_data.len());

                // 计算文件哈希值
                let mut hasher = Sha256::new();
                hasher.update(&binary_data);
                let hash_result = hasher.finalize();
                let file_hash = format!("{:x}", hash_result);

                // 获取原始文件名（优先级：1.raw中的文件名 2.Content-Disposition头）
                let original_file_name = original_file_name_from_raw.clone()
                    .or_else(|| extract_filename_from_content_disposition(&content_disposition))
                    .unwrap_or_else(|| format!("file_{}.tmp", biz_id));

                // 提取原始文件的扩展名
                let ext = std::path::Path::new(&original_file_name)
                    .extension()
                    .map(|ext| ext.to_string_lossy().to_string())
                    .unwrap_or_default();

                // 创建uuid_v4作为文件名，但保留扩展名
                let uuid = uuid::Uuid::new_v4().to_string();
                let file_name = if !ext.is_empty() {
                    format!("{}.{}", uuid, ext)
                } else {
                    // 如果没有扩展名，使用.tmp作为默认扩展名
                    format!("{}.tmp", uuid)
                };
                let resource_path = get_config(MONTHLY_RESOURCE_PATH).ok_or(anyhow!("无法获取当月资源路径"))?;

                // 构建文件路径
                let file_path = format!("{}/{}", resource_path, file_name);
                info!("文件保存路径: {}", file_path);

                // 保存文件到本地
                let mut file = fs::File::create(&file_path)?;
                file.write_all(&binary_data)?;
                info!("文件已保存到: {}", file_path);

                // 插入文件记录到数据库
                insert_file_record(
                    biz_id,
                    &uuid,
                    &file_name,
                    &file_path,
                    binary_data.len() as i64,
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
