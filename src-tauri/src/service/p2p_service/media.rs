//! 自建 P2P 媒体数据面：音视频帧、文本、媒体配置/控制/信息。

use std::time::Duration;

use anyhow::anyhow;
use log::{info, warn};

use crate::models::bo::p2p_models::{MediaFrameType, P2pChannelType, P2pMediaConfig, P2pMediaInfo};
use crate::quic_core::center_service::text_msg_service::generate_text_msg;
use crate::quic_core::p2p::io::{get_sender, send_media_frame};
use crate::service::user_service::get_user_info;
use crate::utils::message_types::{
    MSG_TYPE_P2P_MEDIA_CONFIG, MSG_TYPE_P2P_MEDIA_CONTROL, MSG_TYPE_P2P_MEDIA_INFO,
    MSG_TYPE_P2P_TEXT,
};
use crate::GLOBAL_QUIC_USER_INFO;

/// 发送视频帧信息
/// 使用轻量级MediaFrameHeader格式，替代通用的TextQuicMsg序列化
/// 减少bincode序列化开销和内存拷贝
pub async fn send_p2p_video_frame_service(
    frame_data: Vec<u8>,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    // 热路径：每帧日志降级为 trace，避免高频打印拖慢编码线程
    log::trace!("帧大小 {}", frame_data.len());
    // 使用轻量级帧格式：5字节头部 + 原始数据，避免bincode序列化
    send_media_frame(MediaFrameType::Video, frame_data, target_uuid).await
}

/// 发送p2p文本消息
pub async fn send_p2p_text_msg_service(
    text: String,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    info!("发送p2p文本消息给 {}", target_uuid);
    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };

    let text_data =
        generate_text_msg(MSG_TYPE_P2P_TEXT, text.into_bytes(), target_uuid.clone(), sender)?;

    let send_stream = get_sender(&target_uuid, &P2pChannelType::Default).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&text_data).await?;
    }

    info!("p2p文本消息发送完成");
    Ok(())
}

/// 发送p2p音频数据
/// 使用轻量级MediaFrameHeader格式，替代通用的TextQuicMsg序列化
/// 减少bincode序列化开销和内存拷贝
///
/// # 参数
/// - `audio_data`: 音频帧数据 (Opus编码)
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_audio_frame_service(
    audio_data: Vec<u8>,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    // 热路径：每帧日志降级为 trace，避免高频打印拖慢编码线程
    log::trace!("音频帧大小 {}", audio_data.len());
    // 使用轻量级帧格式：5字节头部 + 原始数据，避免bincode序列化
    send_media_frame(MediaFrameType::Audio, audio_data, target_uuid).await
}

/// 发送p2p媒体配置信息
/// 用于视频聊天初始化时的参数协商
///
/// # 参数
/// - `media_config`: 媒体配置JSON字符串
/// - `uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_media_config_service(
    media_config: String,
    uuid: String,
) -> Result<(), anyhow::Error> {
    info!("开始发送媒体配置信息 {}", uuid);
    let media_config = serde_json::from_str::<P2pMediaConfig>(&media_config)?;
    let media_config_vec = serde_json::to_vec(&media_config)?;
    let me = get_user_info("uuid").await?;
    let p2p_data =
        generate_text_msg(MSG_TYPE_P2P_MEDIA_CONFIG, media_config_vec, String::new(), me)?;

    for _ in 0..10 {
        info!("等待p2p连接 {}", uuid);
        {
            match get_sender(&uuid, &P2pChannelType::Default).await {
                Ok(sender) => {
                    info!("发送p2p媒体配置信息 {}", uuid);
                    let mut guard = sender.lock().await;
                    guard.write_all(&p2p_data).await?;
                    return Ok(());
                }
                Err(e) => {
                    warn!("找不到发送流，等待下一次获取 {}", e);
                }
            };
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Ok(())
}

/// 发送p2p媒体控制命令
/// 用于控制视频/音频的开关等操作
///
/// # 参数
/// - `control_type`: 控制类型 (VideoToggle/AudioToggle/Pause/Resume/EndCall)
/// - `enabled`: 是否启用
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_media_control_service(
    control_type: String,
    enabled: bool,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    info!("发送媒体控制命令: {} = {}", control_type, enabled);

    use crate::models::bo::p2p_models::P2pMediaControlType;

    let control_type_enum = match control_type.as_str() {
        "VideoToggle" => P2pMediaControlType::VideoToggle,
        "AudioToggle" => P2pMediaControlType::AudioToggle,
        "Pause" => P2pMediaControlType::Pause,
        "Resume" => P2pMediaControlType::Resume,
        "EndCall" => P2pMediaControlType::EndCall,
        _ => return Err(anyhow!("未知的控制类型: {}", control_type)),
    };

    let control = crate::models::bo::p2p_models::P2pMediaControl {
        control_type: control_type_enum,
        enabled,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis()
            as u64,
    };

    let control_vec = serde_json::to_vec(&control)?;
    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };

    let control_msg =
        generate_text_msg(MSG_TYPE_P2P_MEDIA_CONTROL, control_vec, target_uuid.clone(), sender)?;

    let send_stream = get_sender(&target_uuid, &P2pChannelType::Default).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&control_msg).await?;
    }

    info!("媒体控制命令发送完成");
    Ok(())
}

/// 发送p2p媒体信息
/// 通过MediaInfo通道发送媒体状态信息
/// 如分辨率变化、码率调整、帧率统计等
///
/// # 参数
/// - `info_type`: 媒体信息类型 (ResolutionChange/BitrateChange/FrameRateStats/NetworkQuality/EncoderInfo/Custom)
/// - `data`: 媒体信息数据 (JSON字符串)
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_media_info_service(
    info_type: String,
    data: String,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    info!("发送媒体信息: type={}, target={}", info_type, target_uuid);

    use crate::models::bo::p2p_models::P2pMediaInfoType;

    let info_type_enum = match info_type.as_str() {
        "ResolutionChange" => P2pMediaInfoType::ResolutionChange,
        "BitrateChange" => P2pMediaInfoType::BitrateChange,
        "FrameRateStats" => P2pMediaInfoType::FrameRateStats,
        "NetworkQuality" => P2pMediaInfoType::NetworkQuality,
        "EncoderInfo" => P2pMediaInfoType::EncoderInfo,
        other => P2pMediaInfoType::Custom(other.to_string()),
    };

    let media_info = P2pMediaInfo {
        info_type: info_type_enum,
        data,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis()
            as u64,
    };

    let info_vec = serde_json::to_vec(&media_info)?;
    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };

    let info_msg =
        generate_text_msg(MSG_TYPE_P2P_MEDIA_INFO, info_vec, target_uuid.clone(), sender)?;

    // 使用MediaInfo通道发送
    let send_stream = get_sender(&target_uuid, &P2pChannelType::MediaInfo).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&info_msg).await?;
    }

    info!("媒体信息发送完成");
    Ok(())
}
