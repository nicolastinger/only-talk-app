use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use anyhow::anyhow;
use image::ImageReader;
use log::{error, info};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::time::timeout;

use crate::models::entity::chat_record_raw::{ChatRecordRaw, FileRecord, ImageRecord};
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::api_service::{upload_file_with_progress, UploadProgressFn};
use crate::utils::global_static_str::{
    talk_api_base, MAX_FILE_UPLOAD_SIZE, MAX_IMAGE_UPLOAD_SIZE, PLATFORM, ZERO_UUID,
};
use crate::utils::image_utils::{compress_image_to_webp, should_skip_image_compression};
use crate::{APP_HANDLE, GLOBAL_MSG_SEND_LOCK};

use super::send::send_text_msg_service;

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct FileInfo {
    pub(super) biz_id: String,
    origin_file_id: Option<String>,
    file_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct UploadData {
    uuid: String,
    biz_name: String,
    description: String,
    biz_type: String,
    remark: String,
    pub(super) file_infos: Vec<FileInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UploadResponse {
    code: i32,
    data: UploadData,
    message: String,
}

/// 发送进度事件负载(事件名 `chat_file_upload_progress`)。
/// `phase`: reading(读取/准备) / compressing(压缩) / uploading(上传, 带字节进度)。
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatFileUploadProgress {
    nano_id: String,
    file_name: String,
    phase: String,
    uploaded: u64,
    total: u64,
}

/// 上报发送进度(前端按 nano_id 匹配对应消息; 无 AppHandle 时忽略)。
fn emit_chat_send_progress(nano_id: &str, file_name: &str, phase: &str, uploaded: u64, total: u64) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit(
            "chat_file_upload_progress",
            ChatFileUploadProgress {
                nano_id: nano_id.to_string(),
                file_name: file_name.to_string(),
                phase: phase.to_string(),
                uploaded,
                total,
            },
        );
    }
}

/// 构造以 nano_id 为键的上传进度回调(phase = uploading)。
fn build_upload_progress(nano_id: &str, file_name: &str) -> UploadProgressFn {
    let nano_id = nano_id.to_string();
    let file_name = file_name.to_string();
    Arc::new(move |uploaded, total| {
        emit_chat_send_progress(&nano_id, &file_name, "uploading", uploaded, total);
    })
}

/// 解析上传响应为 UploadData。
async fn parse_upload_response(response: reqwest::Response) -> Result<UploadData, anyhow::Error> {
    let status = response.status();
    let response_text = response.text().await?;

    if !status.is_success() {
        return Err(anyhow!("上传失败: {}, 响应: {}", status, response_text));
    }

    let upload_response: UploadResponse = serde_json::from_str(&response_text)
        .map_err(|e| anyhow!("解析上传响应失败: {}, 响应内容: {}", e, response_text))?;

    if upload_response.code != 200 {
        return Err(anyhow!("上传失败: {}", upload_response.message));
    }

    Ok(upload_response.data)
}

/// 上传单聊聊天文件(流式 + 进度上报)。
async fn upload_chat_file_server(
    file_path: &str,
    friend_uuid: &str,
    nano_id: &str,
) -> Result<UploadData, anyhow::Error> {
    let url = format!("{}/file_integrated/upload/user_chat/{}", talk_api_base(), friend_uuid);
    let file_name = Path::new(file_path).file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let progress = build_upload_progress(nano_id, file_name);
    let response = upload_file_with_progress(&url, file_path, "file", Some(progress)).await?;
    parse_upload_response(response).await
}

/// 上传群聊文件到服务器（不检查好友关系, 流式 + 进度上报）。
pub(super) async fn upload_group_chat_file_server(
    file_path: &str,
    group_uuid: &str,
    nano_id: &str,
) -> Result<UploadData, anyhow::Error> {
    let url = format!("{}/file_integrated/upload/group_chat/{}", talk_api_base(), group_uuid);
    let file_name = Path::new(file_path).file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let progress = build_upload_progress(nano_id, file_name);
    let response = upload_file_with_progress(&url, file_path, "file", Some(progress)).await?;
    parse_upload_response(response).await
}

/// 校验上传文件大小, 超限返回面向用户的错误。
pub(super) fn ensure_within_size_limit(
    file_path: &str,
    max_size: u64,
    kind: &str,
) -> Result<u64, anyhow::Error> {
    let size = std::fs::metadata(file_path)?.len();
    if size > max_size {
        let limit_mb = max_size / (1024 * 1024);
        return Err(anyhow!("{}大小超过限制（最大 {}MB）", kind, limit_mb));
    }
    Ok(size)
}

/// 图片上传前的重计算(大小校验/压缩/尺寸解析/大小读取)。
///
/// 全部是同步 CPU/IO 操作, 必须在阻塞线程池执行, 否则会占用 tokio worker
/// 导致其他异步命令(含前端 IPC)排队, 表现为聊天界面卡死。
/// 返回 `(待上传路径, 宽, 高, 字节大小)`。
pub(super) fn prepare_image_for_upload(
    file_path: &str,
    nano_id: &str,
    file_name: &str,
) -> Result<(String, i32, i32, i32), anyhow::Error> {
    // 0、大小校验
    ensure_within_size_limit(file_path, MAX_IMAGE_UPLOAD_SIZE, "图片")?;

    // 1、GIF/WebP/已压缩产物跳过压缩(原图上传), 否则压缩到当月资源目录
    let upload_path = if should_skip_image_compression(Path::new(file_path)) {
        info!("跳过图片压缩(原图上传): {}", file_path);
        file_path.to_string()
    } else {
        emit_chat_send_progress(nano_id, file_name, "compressing", 0, 0);
        compress_image_to_webp(Path::new(file_path))?.to_string_lossy().to_string()
    };

    // 2、获取图片尺寸信息
    let img = ImageReader::open(file_path)?.decode()?;
    let img_width = img.width() as i32;
    let img_height = img.height() as i32;

    // 3、获取上传文件的字节大小
    let img_size = std::fs::metadata(&upload_path)?.len() as i32;

    Ok((upload_path, img_width, img_height, img_size))
}

// 发送图片数据
pub async fn send_image_msg_service(text_quic_msg: TextQuicMsgVo) -> Result<(), anyhow::Error> {
    let file_path = text_quic_msg.raw.clone();
    let nano_id = text_quic_msg.nano_id.clone();
    let file_name = Path::new(&file_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image")
        .to_string();

    // 0-3、大小校验 / 压缩 / 尺寸解析 / 大小读取(阻塞线程池, 避免卡住 UI 线程)
    let (upload_path, img_width, img_height, img_size) = {
        let file_path = file_path.clone();
        let nano_id = nano_id.clone();
        let file_name = file_name.clone();
        tokio::task::spawn_blocking(move || {
            prepare_image_for_upload(&file_path, &nano_id, &file_name)
        })
        .await
        .map_err(|e| anyhow!("图片预处理线程异常: {}", e))??
    };

    // 4、上传图片到文件服务器(流式 + 进度)
    let upload_data =
        upload_chat_file_server(&upload_path, &text_quic_msg.recv_user, &nano_id).await?;

    // 5、获取第一个 file_info 的 biz_id
    let file_info = upload_data.file_infos.first().ok_or(anyhow!("file_infos 为空"))?;
    let biz_id = file_info.biz_id.clone();

    // 6、组装 ImageRecord
    let image_record = ImageRecord {
        prev_id: ZERO_UUID.to_string(),
        biz_id,
        file_name,
        is_preview: false,
        img_width,
        img_height,
        img_size,
        platform: PLATFORM,
    };

    let image_raw = image_record.json_serialize()?;

    // 7、创建新的 TextQuicMsgVo 用于发送
    let mut image_msg = text_quic_msg.clone();
    image_msg.raw = image_raw;

    // 8、调用 send_text_msg_service 发送消息
    // 获取全局消息发送锁，保证数据库最新消息，超过10秒后获取不到锁就返回错误
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        let res = send_text_msg_service(image_msg).await;
        res
    })
    .await;

    match result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            error!("获取锁时发生意外错误,{}", e);
            return Err(anyhow!("获取锁时发生意外错误,{}", e));
        }
        Err(elapsed) => {
            error!("超时：10秒内未能获取锁 {}", elapsed);
            return Err(anyhow!("超时：10秒内未能获取锁 {}", elapsed));
        }
    }

    Ok(())
}

// 发送文件数据
pub async fn send_file_msg_service(text_quic_msg: TextQuicMsgVo) -> Result<(), anyhow::Error> {
    let file_path = text_quic_msg.raw.clone();
    let path = Path::new(&file_path);
    let nano_id = text_quic_msg.nano_id.clone();

    // 1、获取文件名和文件扩展名
    let file_name =
        path.file_name().and_then(|name| name.to_str()).unwrap_or("unknown").to_string();

    let file_type = path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_string();

    // 2、获取文件大小(含大小限制校验)
    let file_size = ensure_within_size_limit(&file_path, MAX_FILE_UPLOAD_SIZE, "文件")? as i64;

    // 3、上传文件到文件服务器(流式 + 进度)
    let upload_data =
        upload_chat_file_server(&file_path, &text_quic_msg.recv_user, &nano_id).await?;

    // 4、获取第一个 file_info 的 biz_id
    let file_info = upload_data.file_infos.first().ok_or(anyhow!("file_infos 为空"))?;
    let biz_id = file_info.biz_id.clone();

    // 5、组装 FileRecord
    let file_record = FileRecord {
        prev_id: ZERO_UUID.to_string(),
        biz_id,
        file_name,
        file_size,
        file_type,
        platform: PLATFORM,
    };

    let file_raw = file_record.json_serialize()?;

    // 6、创建新的 TextQuicMsgVo 用于发送
    let mut file_msg = text_quic_msg.clone();
    file_msg.raw = file_raw;

    // 7、调用 send_text_msg_service 发送消息
    // 获取全局消息发送锁，保证数据库最新消息，超过10秒后获取不到锁就返回错误
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        let res = send_text_msg_service(file_msg).await;
        res
    })
    .await;

    match result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            error!("获取锁时发生意外错误,{}", e);
            return Err(anyhow!("获取锁时发生意外错误,{}", e));
        }
        Err(elapsed) => {
            error!("超时：10秒内未能获取锁 {}", elapsed);
            return Err(anyhow!("超时：10秒内未能获取锁 {}", elapsed));
        }
    }

    Ok(())
}
