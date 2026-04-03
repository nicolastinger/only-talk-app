use log::info;

use crate::entity::p2p_models::{P2pInitMsg, P2pVideoData};
use crate::quic_service::p2p_service::p2p_quic_service::LOG_SENDER;
use crate::quic_service::udp_utils::send_udp_ping_msg;
use crate::service::p2p_service::{
    access_p2p_request, close_p2p_connection_service, find_available_udp_port, reject_p2p_request,
    send_p2p_audio_frame_service, send_p2p_text_msg_service, send_p2p_video_config_service, 
    send_p2p_video_control_service, send_p2p_video_frame_service,
};
use crate::utils::global_static_str::UDP_SOCKET;

/// 发送p2p请求给好友
#[tauri::command]
pub async fn send_p2p_init_msg(accept_user: String) -> Result<String, String> {
    info!("向 {} 发起p2p请求", accept_user);
    crate::service::p2p_service::send_p2p_init_msg(accept_user).await.map_err(|e| e.to_string())?;
    Ok("success".to_string())
}

/// 给服务器发送udp请求，服务器记录ip端口
#[tauri::command]
pub async fn send_init_p2p_udp() -> Result<String, String> {
    let udp_port = find_available_udp_port(10024).ok_or("no available UDP port")?;
    let addr = format!("0.0.0.0:{}", udp_port);
    send_udp_ping_msg(addr, UDP_SOCKET.to_string()).await.map_err(|e| e.to_string())?;

    Ok(format!("127.0.0.1:{}", udp_port))
}

/// 接受或者拒绝p2p请求
#[tauri::command]
pub async fn process_init_p2p_request(p2p_init_msg: String) -> Result<String, String> {
    info!("process init {}", p2p_init_msg);
    let mut p2p_init_msg =
        serde_json::from_str::<P2pInitMsg>(&p2p_init_msg).map_err(|e| e.to_string())?;
    info!("接收到的p2p信息 {:?}", p2p_init_msg);
    match p2p_init_msg.accept {
        // 接受
        true => {
            p2p_init_msg.accept = true;
            p2p_init_msg.step = 2;
            access_p2p_request(p2p_init_msg).await.map_err(|e| e.to_string())?;
        }
        // 拒绝
        false => {
            p2p_init_msg.step = 1;
            reject_p2p_request(p2p_init_msg).await.map_err(|e| e.to_string())?;
        }
    }

    Ok("success".to_string())
}

/// 发送视频帧数据-无缓存
#[tauri::command]
pub async fn send_p2p_video_frame(frame_data: Vec<u8>, target_uuid: String) -> Result<(), String> {
    send_p2p_video_frame_service(frame_data, target_uuid).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// 发送视频配置
#[tauri::command]
pub async fn send_p2p_video_config(video_config: String, uuid: String) -> Result<(), String> {
    send_p2p_video_config_service(video_config, uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 发送视频帧数据-本地缓存
#[tauri::command]
pub async fn send_video_frame(frame_data: Vec<u8>, uuid: String) -> Result<(), String> {
    info!("帧大小 {}", frame_data.len());
    //直接发送帧数据到前端
    let p2p_video_data = P2pVideoData { uuid, video_data: frame_data };
    {
        LOG_SENDER.lock().await.send(p2p_video_data).await.map_err(|e| e.to_string())?;
    }
    info!("发送完成");
    Ok(())
}

/// 发送p2p文本消息
#[tauri::command]
pub async fn send_p2p_text_msg(text: String, target_uuid: String) -> Result<(), String> {
    send_p2p_text_msg_service(text, target_uuid).await.map_err(|e| e.to_string())
}

/// 关闭p2p连接
#[tauri::command]
pub async fn close_p2p_connection(target_uuid: String) -> Result<(), String> {
    close_p2p_connection_service(target_uuid).await.map_err(|e| e.to_string())
}

/// 发送p2p音频帧数据
#[tauri::command]
pub async fn send_p2p_audio_frame(audio_data: Vec<u8>, target_uuid: String) -> Result<(), String> {
    send_p2p_audio_frame_service(audio_data, target_uuid).await.map_err(|e| e.to_string())
}

/// 发送p2p视频控制消息
#[tauri::command]
pub async fn send_p2p_video_control(control_type: String, target_uuid: String) -> Result<(), String> {
    send_p2p_video_control_service(control_type, target_uuid).await.map_err(|e| e.to_string())
}
