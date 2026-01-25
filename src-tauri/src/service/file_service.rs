use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;

use anyhow::anyhow;
use log::{error, info};
use serde_json::Value;
use sha2::{Digest, Sha256};
use crate::cmd::auth_controller::post;
use crate::config::get_config;
use crate::dao::file_record_db::{delete_file_record_by_id, insert_file_record};
use crate::dto::http_result::HttpResult;
use crate::entity::file_record::FileRecord;
use crate::utils::global_static_str::{RESOURCE_PATH, TALK_API};
use crate::vo::file_vo::FileVo;

pub async fn get_file_by_biz_id_service(biz_id: String) -> Result<Vec<FileVo>, anyhow::Error> {
    // 0、从biz业务表获取文件列表id，biz只负责文件业务
    // 1、从本地获取文件记录
    let mut file_list = FileRecord::get_by_biz_id(&biz_id).await?;
    // 2、是否存在文件
    if file_list.is_empty() {
        // 2-1 从远程下载文件
        download_file_by_biz_service(&biz_id).await?;
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
            error!("文件不存在");
            // 删除文件记录
            let file_id = file.uuid.ok_or(anyhow::anyhow!("文件不存在"))?;
            delete_file_record_by_id(&biz_id, &file_id).await?;
            return Err(anyhow::anyhow!("文件不存在"));
        }
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
            original_file_name: None,
            original_file_path: None,
            absolute_file_path: None,
            raw: Some(raw?),
            size: None,
            is_del: None,
        };
        result.push(file_vo);
    }

    Ok(result)
}

/**
 * 通过业务id下载文件
 */
pub async fn download_file_by_biz_service(biz_id: &str) -> Result<(), anyhow::Error> {
    // 1、 从远程获取文件,单文件直接插入
    let url = format!("{}/file_integrated/download/pub_biz/{}", TALK_API, biz_id);

    // 创建一个空的请求体
    let params = HashMap::new();

    // 发送POST请求
    let response = post(url, params).await?;

    // 检查响应状态码
    if !response.status().is_success() {
        return Err(anyhow!("请求失败: {}", response.status()));
    }

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

    // 根据内容类型决定如何处理响应
    if content_type.contains("application/json") {
        // 处理JSON响应
        let json_response: HttpResult = response.json().await?;
        info!("获取到JSON响应: code={}, message={}", json_response.code, json_response.message);

        // 如果code为200且data是数组，表示返回了文件ID列表
        if json_response.code == 200 {
            if let Value::Array(file_ids) = json_response.data {
                info!("获取到文件ID列表: {:?}", file_ids);
                // 这里可以根据文件ID列表进一步处理
                // 例如：遍历文件ID并下载每个文件
                // 可以在这里调用其他文件下载逻辑
            }
        }
    } else {
        // 处理二进制响应
        let binary_data = response.bytes().await?;
        info!("获取到二进制数据，大小: {} bytes", binary_data.len());

        // 计算文件哈希值
        let mut hasher = Sha256::new();
        hasher.update(&binary_data);
        let hash_result = hasher.finalize();
        let file_hash = format!("{:x}", hash_result);

        // 获取原始文件名（从Content-Disposition头或URL中提取）
        let original_file_name = extract_filename_from_content_disposition(&content_disposition)
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
            error!("无法获取原始文件的扩展名");
            return Err(anyhow!("无法保存文件"));
        };
        let resource_path = get_config(RESOURCE_PATH).ok_or(anyhow!("无法获取资源路径"))?;

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
