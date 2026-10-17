//! 按业务 id 查询本地文件记录(存在性/文件名回溯)。

use std::fs;
use std::path::Path;

use log::{error, info};

use super::download::download_file_by_biz_service;
use crate::dao::chat_record_db::query_chat_record_by_id_from_db;
use crate::dao::file_record_db::{
    delete_file_record_by_id, increment_download_retry_count, insert_failed_file_record,
    MAX_DOWNLOAD_RETRY_COUNT,
};
use crate::models::entity::chat_record_raw::{ChatRecordRaw, FileRecord as ChatFileRecord};
use crate::models::entity::file_record::FileRecord;
use crate::models::vo::file_vo::FileVo;
use crate::utils::uuid_utils;

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
