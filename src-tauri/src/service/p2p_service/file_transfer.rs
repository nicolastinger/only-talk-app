//! P2P 文件传输：请求/响应握手与分片数据传输。

use anyhow::anyhow;
use log::info;

use crate::models::bo::p2p_models::{
    P2pChannelType, P2pFileData, P2pFileTransferRequest, P2pFileTransferResponse,
};
use crate::quic_core::center_service::text_msg_service::generate_text_msg;
use crate::quic_core::p2p::io::get_sender;
use crate::utils::message_types::{
    MSG_TYPE_P2P_FILE_DATA, MSG_TYPE_P2P_FILE_TRANSFER_REQUEST, MSG_TYPE_P2P_FILE_TRANSFER_RESPONSE,
};
use crate::GLOBAL_QUIC_USER_INFO;

/// 发送p2p文件数据
/// 通过File通道发送文件分片数据
/// 文件会被切分为多个分片，每个分片通过此函数发送
///
/// # 参数
/// - `file_data`: 文件分片数据结构 (包含分片索引、总片数、数据等)
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_file_data_service(
    file_data: P2pFileData,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    info!(
        "发送文件分片: file={}, chunk={}/{}, transfer_id={}",
        file_data.file_name,
        file_data.chunk_index + 1,
        file_data.total_chunks,
        file_data.transfer_id
    );

    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };

    let file_data_vec = serde_json::to_vec(&file_data)?;
    let file_msg =
        generate_text_msg(MSG_TYPE_P2P_FILE_DATA, file_data_vec, target_uuid.clone(), sender)?;

    // 使用File通道发送
    let send_stream = get_sender(&target_uuid, &P2pChannelType::File).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&file_msg).await?;
    }

    info!("文件分片发送完成: chunk={}", file_data.chunk_index);
    Ok(())
}

/// 发送p2p文件传输请求
/// 通过File通道发送文件传输请求
/// 在发送文件数据前，先发送请求等待对方确认
///
/// # 参数
/// - `transfer_request`: 文件传输请求结构
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_file_transfer_request_service(
    transfer_request: P2pFileTransferRequest,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    info!(
        "发送文件传输请求: file={}, size={}, transfer_id={}",
        transfer_request.file_name, transfer_request.total_size, transfer_request.transfer_id
    );

    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };

    let request_vec = serde_json::to_vec(&transfer_request)?;
    let request_msg = generate_text_msg(
        MSG_TYPE_P2P_FILE_TRANSFER_REQUEST,
        request_vec,
        target_uuid.clone(),
        sender,
    )?;

    // 使用File通道发送
    let send_stream = get_sender(&target_uuid, &P2pChannelType::File).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&request_msg).await?;
    }

    info!("文件传输请求发送完成");
    Ok(())
}

/// 发送p2p文件传输响应
/// 通过File通道发送文件传输响应
/// 对方收到文件传输请求后，通过此函数回复接受或拒绝
///
/// # 参数
/// - `transfer_response`: 文件传输响应结构
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_file_transfer_response_service(
    transfer_response: P2pFileTransferResponse,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    info!(
        "发送文件传输响应: transfer_id={}, accept={}",
        transfer_response.transfer_id, transfer_response.accept
    );

    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };

    let response_vec = serde_json::to_vec(&transfer_response)?;
    let response_msg = generate_text_msg(
        MSG_TYPE_P2P_FILE_TRANSFER_RESPONSE,
        response_vec,
        target_uuid.clone(),
        sender,
    )?;

    // 使用File通道发送
    let send_stream = get_sender(&target_uuid, &P2pChannelType::File).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&response_msg).await?;
    }

    info!("文件传输响应发送完成");
    Ok(())
}
