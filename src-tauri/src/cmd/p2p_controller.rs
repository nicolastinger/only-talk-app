use log::info;

use crate::entity::p2p_models::{P2pFileData, P2pFileTransferRequest, P2pFileTransferResponse, P2pInitMsg, P2pVideoData};
use crate::quic_service::p2p_service::p2p_quic_service::LOG_SENDER;
use crate::quic_service::udp_utils::send_udp_ping_msg;
use crate::service::p2p_service::{
    access_p2p_request, close_p2p_connection_service, find_available_udp_port, reject_p2p_request,
    send_p2p_audio_frame_service, send_p2p_media_config_service, send_p2p_media_control_service,
    send_p2p_media_info_service, send_p2p_text_msg_service, send_p2p_video_call_end_service, send_p2p_video_call_invite_service,
    send_p2p_video_call_response_service, send_p2p_video_config_service, send_p2p_video_frame_service,
    send_p2p_file_data_service, send_p2p_file_transfer_request_service, send_p2p_file_transfer_response_service,
};
use crate::utils::global_static_str::UDP_SOCKET;

/// 发送p2p请求给好友
/// 用于建立P2P连接
#[tauri::command]
pub async fn send_p2p_init_msg(accept_user: String) -> Result<String, String> {
    info!("向 {} 发起p2p请求", accept_user);
    crate::service::p2p_service::send_p2p_init_msg(accept_user).await.map_err(|e| e.to_string())?;
    Ok("success".to_string())
}

/// 给服务器发送udp请求，服务器记录ip端口
/// 用于NAT穿透
#[tauri::command]
pub async fn send_init_p2p_udp() -> Result<String, String> {
    let udp_port = find_available_udp_port(10024).ok_or("no available UDP port")?;
    let addr = format!("0.0.0.0:{}", udp_port);
    send_udp_ping_msg(addr, UDP_SOCKET.to_string()).await.map_err(|e| e.to_string())?;

    Ok(format!("127.0.0.1:{}", udp_port))
}

/// 接受或者拒绝p2p请求
/// 处理P2P连接请求的响应
#[tauri::command]
pub async fn process_init_p2p_request(p2p_init_msg: String) -> Result<String, String> {
    info!("process init {}", p2p_init_msg);
    let mut p2p_init_msg =
        serde_json::from_str::<P2pInitMsg>(&p2p_init_msg).map_err(|e| e.to_string())?;
    info!("接收到的p2p信息 {:?}", p2p_init_msg);
    match p2p_init_msg.accept {
        true => {
            p2p_init_msg.accept = true;
            p2p_init_msg.step = 2;
            access_p2p_request(p2p_init_msg).await.map_err(|e| e.to_string())?;
        }
        false => {
            p2p_init_msg.step = 1;
            reject_p2p_request(p2p_init_msg).await.map_err(|e| e.to_string())?;
        }
    }

    Ok("success".to_string())
}

/// 发送视频帧数据-无缓存
/// 直接发送视频帧到P2P连接
#[tauri::command]
pub async fn send_p2p_video_frame(frame_data: Vec<u8>, target_uuid: String) -> Result<(), String> {
    send_p2p_video_frame_service(frame_data, target_uuid).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// 发送音频帧数据
/// 用于隐私模式视频聊天中的音频传输
#[tauri::command]
pub async fn send_p2p_audio_frame(audio_data: Vec<u8>, target_uuid: String) -> Result<(), String> {
    send_p2p_audio_frame_service(audio_data, target_uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 发送视频配置
/// 用于视频通话参数协商
#[tauri::command]
pub async fn send_p2p_video_config(video_config: String, uuid: String) -> Result<(), String> {
    send_p2p_video_config_service(video_config, uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 发送媒体配置
/// 用于视频聊天初始化时的参数协商
/// 包含视频和音频的综合配置
#[tauri::command]
pub async fn send_p2p_media_config(media_config: String, uuid: String) -> Result<(), String> {
    send_p2p_media_config_service(media_config, uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 发送媒体控制命令
/// 用于控制视频/音频的开关等操作
#[tauri::command]
pub async fn send_p2p_media_control(
    control_type: String,
    enabled: bool,
    target_uuid: String,
) -> Result<(), String> {
    send_p2p_media_control_service(control_type, enabled, target_uuid)
        .await
        .map_err(|e| e.to_string())
}

/// 发送视频帧数据-本地缓存
/// 将视频帧数据缓存到本地队列后发送
#[tauri::command]
pub async fn send_video_frame(frame_data: Vec<u8>, uuid: String) -> Result<(), String> {
    info!("帧大小 {}", frame_data.len());
    let p2p_video_data = P2pVideoData { uuid, video_data: frame_data };
    {
        LOG_SENDER.lock().await.send(p2p_video_data).await.map_err(|e| e.to_string())?;
    }
    info!("发送完成");
    Ok(())
}

/// 发送p2p文本消息
/// 用于隐私聊天中的文本消息传输
#[tauri::command]
pub async fn send_p2p_text_msg(text: String, target_uuid: String) -> Result<(), String> {
    send_p2p_text_msg_service(text, target_uuid).await.map_err(|e| e.to_string())
}

/// 关闭p2p连接
/// 清理P2P连接相关资源
#[tauri::command]
pub async fn close_p2p_connection(target_uuid: String) -> Result<(), String> {
    close_p2p_connection_service(target_uuid).await.map_err(|e| e.to_string())
}

// ==================== 视频通话邀请相关命令 ====================

/// 发送视频通话邀请
/// 当用户发起视频通话时，先发送邀请消息通知对方
/// 对方收到邀请后会弹出视频通话界面
#[tauri::command]
pub async fn send_p2p_video_call_invite(
    target_uuid: String,
    from_name: Option<String>,
) -> Result<(), String> {
    send_p2p_video_call_invite_service(target_uuid, from_name)
        .await
        .map_err(|e| e.to_string())
}

/// 发送视频通话响应
/// 当用户接受或拒绝视频通话邀请时发送
/// - accept: true 接受邀请
/// - accept: false 拒绝邀请
#[tauri::command]
pub async fn send_p2p_video_call_response(
    target_uuid: String,
    accept: bool,
    media_config: Option<String>,
    reject_reason: Option<String>,
) -> Result<(), String> {
    send_p2p_video_call_response_service(target_uuid, accept, media_config, reject_reason)
        .await
        .map_err(|e| e.to_string())
}

/// 发送视频通话结束通知
/// 当用户主动结束视频通话时发送
#[tauri::command]
pub async fn send_p2p_video_call_end(target_uuid: String) -> Result<(), String> {
    send_p2p_video_call_end_service(target_uuid)
        .await
        .map_err(|e| e.to_string())
}

/// 发送p2p媒体信息
/// 通过MediaInfo通道发送媒体状态信息
/// 用于传输分辨率变化、码率调整、帧率统计等控制信令
#[tauri::command]
pub async fn send_p2p_media_info(
    info_type: String,
    data: String,
    target_uuid: String,
) -> Result<(), String> {
    send_p2p_media_info_service(info_type, data, target_uuid)
        .await
        .map_err(|e| e.to_string())
}

// ==================== 文件传输相关命令 ====================

/// 发送p2p文件数据
/// 通过File通道发送文件分片数据
/// 文件会被切分为多个分片，每个分片独立发送
#[tauri::command]
pub async fn send_p2p_file_data(
    file_data: String,
    target_uuid: String,
) -> Result<(), String> {
    let file_data = serde_json::from_str::<P2pFileData>(&file_data).map_err(|e| e.to_string())?;
    send_p2p_file_data_service(file_data, target_uuid)
        .await
        .map_err(|e| e.to_string())
}

/// 发送p2p文件传输请求
/// 在发送文件数据前，先发送请求等待对方确认
#[tauri::command]
pub async fn send_p2p_file_transfer_request(
    transfer_request: String,
    target_uuid: String,
) -> Result<(), String> {
    let transfer_request = serde_json::from_str::<P2pFileTransferRequest>(&transfer_request).map_err(|e| e.to_string())?;
    send_p2p_file_transfer_request_service(transfer_request, target_uuid)
        .await
        .map_err(|e| e.to_string())
}

/// 发送p2p文件传输响应
/// 对方收到文件传输请求后，通过此命令回复接受或拒绝
#[tauri::command]
pub async fn send_p2p_file_transfer_response(
    transfer_response: String,
    target_uuid: String,
) -> Result<(), String> {
    let transfer_response = serde_json::from_str::<P2pFileTransferResponse>(&transfer_response).map_err(|e| e.to_string())?;
    send_p2p_file_transfer_response_service(transfer_response, target_uuid)
        .await
        .map_err(|e| e.to_string())
}
