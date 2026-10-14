//! 视频通话信令：邀请/响应/结束、媒体就绪、视频配置协商。
//!
//! 这一层是通话业务的信令编排（邀请、应答、结束），复用自建 P2P 的发送流。

use std::time::Duration;

use anyhow::anyhow;
use log::{info, warn};

use crate::models::bo::p2p_models::{P2pChannelType, P2pVideoConfig};
use crate::quic_service::center_service::text_msg_service::generate_text_msg;
use crate::quic_service::p2p_service::p2p_quic_service::get_sender;
use crate::service::user_service::get_user_info;
use crate::utils::message_types::{
    MSG_TYPE_P2P_MEDIA_READY, MSG_TYPE_P2P_VIDEO_CALL_ACCEPT, MSG_TYPE_P2P_VIDEO_CALL_END,
    MSG_TYPE_P2P_VIDEO_CALL_INVITE, MSG_TYPE_P2P_VIDEO_CALL_REJECT, MSG_TYPE_P2P_VIDEO_CONFIG,
};
use crate::GLOBAL_QUIC_USER_INFO;

/// 发送p2p视频配置信息，提示对方已就绪
pub async fn send_p2p_video_config_service(
    video_config: String,
    uuid: String,
) -> Result<(), anyhow::Error> {
    info!("开始发送配置信息 {}", uuid);
    let video_config = serde_json::from_str::<P2pVideoConfig>(&video_config)?;
    let video_config_vec = serde_json::to_vec(&video_config)?;
    let me = get_user_info("uuid").await?;
    let p2p_data =
        generate_text_msg(MSG_TYPE_P2P_VIDEO_CONFIG, video_config_vec, String::new(), me)?;
    for _ in 0..10 {
        info!("等待p2p连接 {}", uuid);
        {
            match get_sender(&uuid, &P2pChannelType::Default).await {
                Ok(sender) => {
                    info!("发送p2p视频配置信息 {}", uuid);
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

/// 发送视频通话邀请
/// 当用户发起视频通话时，先发送邀请消息通知对方
/// 对方收到邀请后会弹出视频通话界面
///
/// # 参数
/// - `target_uuid`: 目标用户UUID
/// - `from_name`: 邀请者昵称 (可选)
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
///
/// # 流程
/// 1. 构造邀请消息结构体
/// 2. 序列化为JSON
/// 3. 通过P2P连接发送给对方
/// 4. 对方收到后会触发 `video_call_invite` 事件
pub async fn send_p2p_video_call_invite_service(
    target_uuid: String,
    from_name: Option<String>,
) -> Result<(), anyhow::Error> {
    info!("发送视频通话邀请给: {}", target_uuid);

    // 获取当前用户UUID
    let from_uuid = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("无法获取当前用户UUID"))?.clone()
    };

    // 构造邀请消息
    let invite = crate::models::bo::p2p_models::P2pVideoCallInvite {
        from_uuid: from_uuid.clone(),
        to_uuid: target_uuid.clone(),
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis()
            as u64,
        media_config: Some(crate::models::bo::p2p_models::P2pMediaConfig::default()),
        from_name,
    };

    // 序列化邀请消息
    let invite_vec = serde_json::to_vec(&invite)?;

    // 生成P2P消息
    let invite_msg = generate_text_msg(
        MSG_TYPE_P2P_VIDEO_CALL_INVITE,
        invite_vec,
        target_uuid.clone(),
        from_uuid,
    )?;

    // 发送邀请消息
    let send_stream = get_sender(&target_uuid, &P2pChannelType::Default).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&invite_msg).await?;
    }

    info!("视频通话邀请发送完成");
    Ok(())
}

/// 发送视频通话响应
/// 当用户接受或拒绝视频通话邀请时发送
/// 添加重试逻辑等待P2P连接就绪，解决首次通话时连接未建立导致响应丢失的问题
///
/// # 参数
/// - `target_uuid`: 目标用户UUID (邀请者)
/// - `accept`: 是否接受邀请
/// - `media_config`: 媒体配置 (接受时需要)
/// - `reject_reason`: 拒绝原因 (拒绝时可选)
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_video_call_response_service(
    target_uuid: String,
    accept: bool,
    media_config: Option<String>,
    reject_reason: Option<String>,
) -> Result<(), anyhow::Error> {
    info!("发送视频通话响应给: {}, 接受: {}", target_uuid, accept);

    // 获取当前用户UUID
    let from_uuid = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("无法获取当前用户UUID"))?.clone()
    };

    // 解析媒体配置
    let media_config = if let Some(config_str) = media_config {
        Some(serde_json::from_str::<crate::models::bo::p2p_models::P2pMediaConfig>(&config_str)?)
    } else if accept {
        // 如果接受但没有提供配置，使用默认配置
        Some(crate::models::bo::p2p_models::P2pMediaConfig::default())
    } else {
        None
    };

    // 构造响应消息
    let response = crate::models::bo::p2p_models::P2pVideoCallResponse {
        from_uuid: from_uuid.clone(),
        to_uuid: target_uuid.clone(),
        accept,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis()
            as u64,
        media_config,
        reject_reason,
    };

    // 序列化响应消息
    let response_vec = serde_json::to_vec(&response)?;

    // 选择消息类型
    let msg_type =
        if accept { MSG_TYPE_P2P_VIDEO_CALL_ACCEPT } else { MSG_TYPE_P2P_VIDEO_CALL_REJECT };

    // 生成P2P消息
    let response_msg = generate_text_msg(msg_type, response_vec, target_uuid.clone(), from_uuid)?;

    // 重试逻辑：等待P2P连接就绪（最多10秒）
    // 解决首次通话时P2P连接尚未建立导致响应丢失的问题
    for attempt in 0..10 {
        match get_sender(&target_uuid, &P2pChannelType::Default).await {
            Ok(sender) => {
                info!("视频通话响应发送成功 (尝试{}/{})", attempt + 1, 10);
                let mut guard = sender.lock().await;
                guard.write_all(&response_msg).await?;
                return Ok(());
            }
            Err(e) => {
                warn!("等待P2P连接就绪... 尝试{}/10: {}", attempt + 1, e);
            }
        };
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    Err(anyhow!("发送视频通话响应失败: P2P连接在10秒内未就绪"))
}

/// 发送视频通话结束通知
/// 当用户主动结束视频通话时发送
///
/// # 参数
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_video_call_end_service(target_uuid: String) -> Result<(), anyhow::Error> {
    info!("发送视频通话结束通知给: {}", target_uuid);

    // 获取当前用户UUID
    let from_uuid = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("无法获取当前用户UUID"))?.clone()
    };

    // 生成结束消息
    let end_msg = generate_text_msg(
        MSG_TYPE_P2P_VIDEO_CALL_END,
        vec![], // 空payload
        target_uuid.clone(),
        from_uuid,
    )?;

    // 发送结束消息
    let send_stream = get_sender(&target_uuid, &P2pChannelType::Default).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&end_msg).await?;
    }

    info!("视频通话结束通知发送完成");

    // 停止MediaData通道的接收循环，释放资源
    {
        let guard = crate::MEDIA_DATA_CANCEL_TOKEN.read().await;
        if let Some(token) = guard.as_ref() {
            info!("触发MediaData通道取消令牌（本方结束通话）");
            token.cancel();
        }
    }

    Ok(())
}

/// 发送媒体接收就绪信号
/// 当本地媒体接收器(MediaSource/SourceBuffer)初始化完成后调用
/// 通知对方可以开始发送媒体数据
///
/// 这是解决视频黑屏问题的关键：
/// 确保接收方准备好后才发送数据，避免初始化段丢失
///
/// # 参数
/// - `target_uuid`: 目标用户UUID
///
/// # 返回
/// - 成功返回Ok(())
/// - 失败返回错误信息
pub async fn send_p2p_media_ready_service(target_uuid: String) -> Result<(), anyhow::Error> {
    info!("发送媒体接收就绪信号给: {}", target_uuid);

    // 获取当前用户UUID
    let from_uuid = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("无法获取当前用户UUID"))?.clone()
    };

    // 生成就绪消息
    let ready_msg = generate_text_msg(
        MSG_TYPE_P2P_MEDIA_READY,
        vec![], // 空payload，只需要知道是谁发的
        target_uuid.clone(),
        from_uuid,
    )?;

    // 发送就绪消息
    let send_stream = get_sender(&target_uuid, &P2pChannelType::Default).await?;
    {
        let mut guard = send_stream.lock().await;
        guard.write_all(&ready_msg).await?;
    }

    info!("媒体接收就绪信号发送完成");
    Ok(())
}
