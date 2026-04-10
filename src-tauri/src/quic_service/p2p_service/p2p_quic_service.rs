use std::sync::Arc;
use std::time::Duration;

use anyhow::anyhow;
use lazy_static::lazy_static;
use log::{error, info, warn};
use quinn::SendStream;
use tauri::Emitter;
use tokio::sync::mpsc::Sender;
use tokio::sync::{mpsc, Mutex};

use crate::entity::p2p_models::{P2pChannelType, P2pFileTransferRequest, P2pFileTransferResponse, P2pMediaConfig, P2pMediaControl, P2pMediaInfo, P2pVideoConfig, P2pVideoData};
use crate::entity::quic_connection::ConnectionType;
use crate::entity::text_msg::TextQuicMsg;
use crate::quic_service::center_service::text_msg_service::{generate_text_msg, get_text_msg};
use crate::service::user_service::insert_user_info;
use crate::utils::global_static_str::{PING, SYSTEM};
use crate::utils::message_types::{
    MSG_TYPE_P2P_AUDIO_DATA, MSG_TYPE_P2P_FILE_DATA, MSG_TYPE_P2P_FILE_TRANSFER_REQUEST,
    MSG_TYPE_P2P_FILE_TRANSFER_RESPONSE, MSG_TYPE_P2P_MEDIA_CONFIG, MSG_TYPE_P2P_MEDIA_CONTROL,
    MSG_TYPE_P2P_MEDIA_INFO, MSG_TYPE_P2P_TEXT, MSG_TYPE_P2P_VIDEO_CALL, MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
    MSG_TYPE_P2P_VIDEO_CALL_END, MSG_TYPE_P2P_VIDEO_CALL_INVITE, MSG_TYPE_P2P_VIDEO_CALL_REJECT,
    MSG_TYPE_P2P_VIDEO_CONFIG, MSG_TYPE_P2P_VIDEO_DATA, MSG_TYPE_PING,
};
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO, P2P_STREAM_SENDER};

/// 视频帧发送通道
/// 用于将视频数据从前端传递到后端发送队列
/// 采用异步通道设计，避免阻塞主线程
lazy_static! {
    pub static ref LOG_SENDER: Mutex<Sender<P2pVideoData>> = {
        // 创建容量为1000的异步通道
        let (tx, mut rx) = mpsc::channel::<P2pVideoData>(1000);
        // 启动后台任务处理视频帧发送
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                tokio::spawn(async move {
                    let video_data = generate_text_msg(
                        MSG_TYPE_P2P_VIDEO_DATA,
                        msg.video_data,
                        String::new(),
                        String::new()
                    ).expect("generate_text_msg error");
                    let send_stream = get_sender(&msg.uuid, &P2pChannelType::MediaData).await.expect("no send_stream");
                    send_stream.lock().await.write_all(&video_data).await.expect("write_all error");
                });
            }
        });
        Mutex::new(tx)
    };
}

/// 获取P2P连接的发送流
/// 根据目标用户UUID和通道类型获取对应的QUIC发送流
/// 
/// # 参数
/// - `target_uuid`: 目标用户UUID
/// - `channel_type`: 通道类型 (Default/MediaInfo)
/// 
/// # 返回
/// - 成功返回发送流的Arc包装
/// - 失败返回错误信息
pub async fn get_sender(target_uuid: &str, channel_type: &P2pChannelType) -> Result<Arc<Mutex<SendStream>>, anyhow::Error> {
    let channel_key = channel_type.to_string();
    let sender = {
        let user_channels = P2P_STREAM_SENDER.get(target_uuid)
            .ok_or(anyhow!("no channels for target: {}", target_uuid))?;
        let target_sender = user_channels.get(&channel_key)
            .ok_or(anyhow!("no sender for channel: {} target: {}", channel_key, target_uuid))?;
        target_sender.send_stream.clone()
    };
    Ok(sender)
}

/// 处理接收到的P2P消息
/// 根据消息类型分发到对应的处理函数
/// 
/// # 参数
/// - `buffer`: 接收缓冲区
/// - `length`: 数据长度
/// - `msg_type`: 连接类型
/// - `buffer_msg`: 缓冲消息
/// - `head_length`: 头部长度
pub async fn process_rec_msg(
    buffer: &mut Vec<u8>,
    length: usize,
    msg_type: &ConnectionType,
    buffer_msg: Arc<Mutex<Vec<u8>>>,
    head_length: usize,
) -> anyhow::Result<()> {
    match msg_type {
        ConnectionType::Video => {
            let text_vec = get_text_msg(buffer, length, buffer_msg, head_length).await?;
            info!("收到p2p客户端信息 {:?}", text_vec.len());
            // 处理消息
            process_msg(text_vec).await?;
        }
        _ => {
            warn!("不支持的信息 {:?}", msg_type);
        }
    }
    Ok(())
}

/// 处理P2P消息
/// 根据消息类型分发到对应的处理函数
/// 这是P2P消息处理的核心函数
/// 
/// # 消息类型处理
/// - VIDEO_CALL_INVITE: 视频通话邀请，通知前端有来电
/// - VIDEO_CALL_ACCEPT: 视频通话接受，通知前端对方已接听
/// - VIDEO_CALL_REJECT: 视频通话拒绝，通知前端对方已拒绝
/// - VIDEO_CALL_END: 视频通话结束，通知前端对方已挂断
/// - VIDEO_DATA: 视频帧数据，转发给前端显示
/// - AUDIO_DATA: 音频帧数据，转发给前端播放
/// - MEDIA_CONFIG: 媒体配置，保存配置并通知前端
/// - MEDIA_CONTROL: 媒体控制，转发给前端处理
/// - TEXT: 文本消息，转发给前端显示
pub async fn process_msg(text_vec: Vec<TextQuicMsg>) -> Result<(), anyhow::Error> {
    for msg in text_vec {
        match msg.text_type {
            // ==================== 视频通话信令处理 ====================
            
            // 视频通话邀请
            // 当收到邀请时，向前端发送 video_call_invite 事件
            // 前端收到后应弹出接听界面
            MSG_TYPE_P2P_VIDEO_CALL_INVITE => {
                info!("接收到视频通话邀请 {:?}", msg);
                if let Some(handle) = APP_HANDLE.get() {
                    // 解析邀请消息
                    let invite_str = String::from_utf8_lossy(&msg.raw).to_string();
                    handle.emit("video_call_invite", invite_str)?;
                }
            }
            
            // 视频通话接受
            // 当对方接受邀请时，通知前端可以开始发送视频流
            MSG_TYPE_P2P_VIDEO_CALL_ACCEPT => {
                info!("对方接受了视频通话邀请 {:?}", msg);
                if let Some(handle) = APP_HANDLE.get() {
                    let response_str = String::from_utf8_lossy(&msg.raw).to_string();
                    handle.emit("video_call_accept", response_str)?;
                }
            }
            
            // 视频通话拒绝
            // 当对方拒绝邀请时，通知前端关闭等待界面
            MSG_TYPE_P2P_VIDEO_CALL_REJECT => {
                info!("对方拒绝了视频通话邀请 {:?}", msg);
                if let Some(handle) = APP_HANDLE.get() {
                    let response_str = String::from_utf8_lossy(&msg.raw).to_string();
                    handle.emit("video_call_reject", response_str)?;
                }
            }
            
            // 视频通话结束
            // 当对方挂断时，通知前端关闭视频界面
            MSG_TYPE_P2P_VIDEO_CALL_END => {
                info!("对方结束了视频通话 {:?}", msg);
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("video_call_end", msg.send_user)?;
                }
            }
            
            // ==================== 媒体数据处理 ====================
            
            // 视频呼叫信息（旧版兼容）
            MSG_TYPE_P2P_VIDEO_CALL => {
                info!("接收到p2p视频呼叫信息 {:?}", msg);
                let accept_user = {
                    let guard = GLOBAL_QUIC_USER_INFO.read().await;
                    let accept_user = guard.get("target_uuid");
                    let accept_user = accept_user.ok_or(anyhow!("获取用户失败"))?.clone();
                    accept_user
                };
                if accept_user == msg.send_user {
                    if let Some(handle) = APP_HANDLE.get() {
                        handle.emit("video_frame", msg.raw)?;
                    }
                }
            }
            
            // 视频帧数据
            // 直接转发给前端显示
            MSG_TYPE_P2P_VIDEO_DATA => {
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("video_frame", msg.raw)?;
                }
            }
            
            // 音频帧数据
            // 直接转发给前端播放
            MSG_TYPE_P2P_AUDIO_DATA => {
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("audio_frame", msg.raw)?;
                }
            }
            
            // ==================== 配置和控制处理 ====================
            
            // 视频配置（旧版兼容）
            MSG_TYPE_P2P_VIDEO_CONFIG => {
                info!("接收到p2p视频配置信息 {:?}", msg);
                let key = format!("p2p_video_config_{}", msg.send_user);
                let video_config = serde_json::from_slice::<P2pVideoConfig>(&msg.raw)?;
                let video_str = serde_json::to_string(&video_config)?;
                insert_user_info(&key, &video_str).await?;
            }
            
            // 媒体配置
            // 保存配置并通知前端
            MSG_TYPE_P2P_MEDIA_CONFIG => {
                info!("接收到p2p媒体配置信息 {:?}", msg);
                let key = format!("p2p_media_config_{}", msg.send_user);
                let media_config = serde_json::from_slice::<P2pMediaConfig>(&msg.raw)?;
                let media_str = serde_json::to_string(&media_config)?;
                insert_user_info(&key, &media_str).await?;
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("media_config", msg.raw)?;
                }
            }
            
            // 媒体控制
            // 转发给前端处理（如对方关闭摄像头等）
            MSG_TYPE_P2P_MEDIA_CONTROL => {
                info!("接收到p2p媒体控制信息 {:?}", msg);
                let _control = serde_json::from_slice::<P2pMediaControl>(&msg.raw)?;
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("media_control", &msg.raw)?;
                }
            }
            
            // 媒体信息
            // 通过媒体信息通道传输的控制信令
            // 如分辨率变化、码率调整、帧率统计等
            MSG_TYPE_P2P_MEDIA_INFO => {
                info!("接收到p2p媒体信息 {:?}", msg);
                let _media_info = serde_json::from_slice::<P2pMediaInfo>(&msg.raw)?;
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("media_info", &msg.raw)?;
                }
            }
            
            // ==================== 文件传输处理 ====================
            
            // 文件数据分片
            // 通过File通道传输的文件分片数据
            MSG_TYPE_P2P_FILE_DATA => {
                info!("接收到p2p文件数据分片 {:?}", msg);
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("p2p_file_data", &msg.raw)?;
                }
            }
            
            // 文件传输请求
            // 发送方发起文件传输时的握手消息
            MSG_TYPE_P2P_FILE_TRANSFER_REQUEST => {
                info!("接收到p2p文件传输请求 {:?}", msg);
                let _request = serde_json::from_slice::<P2pFileTransferRequest>(&msg.raw)?;
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("p2p_file_transfer_request", &msg.raw)?;
                }
            }
            
            // 文件传输响应
            // 接收方确认或拒绝文件传输
            MSG_TYPE_P2P_FILE_TRANSFER_RESPONSE => {
                info!("接收到p2p文件传输响应 {:?}", msg);
                let _response = serde_json::from_slice::<P2pFileTransferResponse>(&msg.raw)?;
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("p2p_file_transfer_response", &msg.raw)?;
                }
            }
            
            // ==================== 文本消息处理 ====================
            
            // P2P文本消息
            // 隐私聊天的文本消息
            MSG_TYPE_P2P_TEXT => {
                info!("接收到p2p文本消息 {:?}", msg);
                if let Some(handle) = APP_HANDLE.get() {
                    let text = String::from_utf8_lossy(&msg.raw).to_string();
                    let p2p_text_msg = serde_json::json!({
                        "type": "p2p_text",
                        "send_user": msg.send_user,
                        "text": text,
                        "timestamp": msg.timestamp,
                    });
                    handle.emit("p2p_text_message", p2p_text_msg.to_string())?;
                }
            }
            
            // 心跳消息
            MSG_TYPE_PING => {
                info!("接收到p2p的ping消息 {:?}", msg);
            }
            
            // 未知消息类型
            _ => {
                info!("意外情况 {:?}", msg);
            }
        }
    }

    Ok(())
}

/// 发送心跳消息
/// 保持P2P连接活跃，检测连接状态
/// 
/// # 参数
/// - `send_stream_ping`: 发送流的Arc包装
/// - `_uuid`: 用户UUID（未使用）
/// 
/// # 工作流程
/// 1. 每2秒发送一次心跳消息
/// 2. 检查P2P连接是否仍然活跃
/// 3. 如果连接已关闭，停止发送心跳
pub fn send_ping_msg(send_stream_ping: Arc<Mutex<SendStream>>, _uuid: String) {
    tokio::spawn(async move {
        loop {
            // 检查p2p连接是否仍然活跃
            let is_active = {
                let guard = GLOBAL_QUIC_USER_INFO.read().await;
                guard.get("p2p_active").map(|v| v == "true").unwrap_or(false)
            };
            
            if !is_active {
                info!("p2p连接已关闭，停止发送心跳");
                break;
            }
            
            info!("发送p2p心跳");
            let me = {
                let guard = GLOBAL_QUIC_USER_INFO.read().await;
                let empty_str = String::new();
                let me = guard.get("uuid").unwrap_or(&empty_str);
                me.clone()
            };
            let ping_msg =
                generate_text_msg(MSG_TYPE_PING, PING.as_bytes().to_vec(), SYSTEM.to_string(), me)
                    .expect("generate_text_msg error");
            {
                let mut send_stream = send_stream_ping.lock().await;
                if let Err(e) = send_stream.write_all(&ping_msg).await {
                    error!("发送ping消息失败: {:?}", e);
                    break;
                }
            }
            // 两秒发送心跳
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}
