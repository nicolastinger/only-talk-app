use std::collections::HashMap;
use std::io;
use std::net::{SocketAddr, SocketAddrV4, SocketAddrV6, UdpSocket};
use std::time::Duration;

use anyhow::anyhow;
use log::{info, warn};
use nanoid::nanoid;
use tauri::Emitter;

use crate::entity::p2p_models::{P2pInitMsg, P2pMediaConfig, P2pMsg, P2pVideoConfig, UserAddressInfo};
use crate::entity::text_msg::TextQuicMsg;
use crate::quic_service::center_service::text_msg_service::generate_text_msg;
use crate::quic_service::p2p_service::p2p_quic_service::get_sender;
use crate::quic_service::p2p_service::p2p_stream_quic_client::run_client;
use crate::quic_service::p2p_service::p2p_stream_quic_server::{
    get_user_address_info, run_server, udp_port_forward, udp_port_forward_ipv6,
};
use crate::service::api_service::post_with_body;
use crate::service::user_service::get_user_info;
use crate::utils::global_static_str::{
    TALK_API, UDP_SOCKET, UDP_SOCKET_2, UDP_SOCKET_V6, UDP_SOCKET_V6_2,
};
use crate::utils::message_types::{
    MSG_TYPE_P2P, MSG_TYPE_P2P_AUDIO_DATA, MSG_TYPE_P2P_MEDIA_CONFIG, MSG_TYPE_P2P_MEDIA_CONTROL,
    MSG_TYPE_P2P_TEXT, MSG_TYPE_P2P_VIDEO_CALL, MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
    MSG_TYPE_P2P_VIDEO_CALL_END, MSG_TYPE_P2P_VIDEO_CALL_INVITE, MSG_TYPE_P2P_VIDEO_CALL_REJECT,
    MSG_TYPE_P2P_VIDEO_CONFIG, P2P_ACCEPT_REQUEST,
};
use crate::{APP_HANDLE, GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

/// 获取10000以上首个可用UDP端口
pub fn find_available_udp_port(start_port: u16) -> Option<u16> {
    (start_port..=65535).find(|&port| is_udp_port_available(port).unwrap_or(false))
}

/// 检查指定端口是否可用
fn is_udp_port_available(port: u16) -> io::Result<bool> {
    let addr = SocketAddrV4::new(
        "0.0.0.0"
            .parse()
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Invalid IP address"))?,
        port,
    );
    match UdpSocket::bind(addr) {
        Ok(_) => Ok(true),                                           // 绑定成功，端口可用
        Err(e) if e.kind() == io::ErrorKind::AddrInUse => Ok(false), // 端口被占用
        Err(e) => Err(e),                                            // 其他错误（如权限不足）
    }
}

/// 发送p2p初始化信息
pub async fn send_p2p_init_msg(accept_user: String) -> Result<(), anyhow::Error> {
    let (sender, request_token) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let sender = guard.get("uuid").ok_or(anyhow!("no sender"))?.clone();
        // 请求标识符
        let request_token = nanoid!();
        (sender, request_token)
    };

    //插入token到服务器，供连接端验证
    // let url = format!("{}/user/add_p2p_token/{}/{}", TALK_API, accept_user, request_token);
    // post_with_body(url, HashMap::new()).await?;

    // 本机作为服务端

    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_server_model".to_string(), "server".to_string());
        guard.insert("p2p_request_token".to_string(), request_token.clone());
        guard.insert("target_uuid".to_string(), accept_user.clone());
    }

    let p2p_init_msg = P2pInitMsg {
        accept_addr: "".to_string(),
        request_addr: "".to_string(),
        request_uuid: sender.clone(),
        accept_uuid: accept_user.clone(),
        request_token,
        accept: false,
        ip_type: 0,
        step: 0,
        is_server: false,
    };
    let p2p_msg =
        generate_text_msg(MSG_TYPE_P2P, serde_json::to_vec(&p2p_init_msg)?, accept_user, sender)?;

    let send_stream = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("找不到连接"))?.send_stream.clone()
    };
    send_stream.write().await.write_all(&p2p_msg).await?;
    Ok(())
}

/// 拒绝用户的p2p请求
pub async fn reject_p2p_request(p2p_init_msg: P2pInitMsg) -> Result<(), anyhow::Error> {
    let me = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let uuid = guard.get("uuid").ok_or(anyhow!("no uuid"))?;
        uuid.clone()
    };
    let p2p_msg = generate_text_msg(
        MSG_TYPE_P2P,
        serde_json::to_vec(&p2p_init_msg)?,
        p2p_init_msg.request_uuid,
        me,
    )?;
    let send_stream = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("找不到连接"))?.send_stream.clone()
    };
    send_stream.write().await.write_all(&p2p_msg).await?;

    Ok(())
}

/// 接受用户的p2p请求
pub async fn access_p2p_request(p2p_init_msg: P2pInitMsg) -> Result<(), anyhow::Error> {
    let uuid = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let uuid = guard.get("uuid").ok_or(anyhow!("no uuid"))?;
        uuid.clone()
    };
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("target_uuid".to_string(), p2p_init_msg.request_uuid.clone());
        guard.insert("p2p_request_token".to_string(), p2p_init_msg.request_token.clone());
    }

    check_user_ip_type().await?;

    let p2p_msg = generate_text_msg(
        MSG_TYPE_P2P,
        serde_json::to_vec(&p2p_init_msg)?,
        p2p_init_msg.request_uuid,
        uuid,
    )?;
    // 发送确认接收信息给服务器
    let send_stream = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("找不到连接"))?.send_stream.clone()
    };
    send_stream.write().await.write_all(&p2p_msg).await?;
    info!("发送接收信息");
    Ok(())
}

/// 检测用户的IP类型
pub async fn check_user_ip_type() -> Result<(), anyhow::Error> {
    // ipv4连接
    let udp_port = find_available_udp_port(10024).ok_or(anyhow!("no available UDP port"))?;
    let port = udp_port;
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_port_v4".to_string(), port.to_string());
    }
    let token = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let token = guard.get("token").ok_or(anyhow!("no token"))?;
        token.clone()
    };

    let udp_port_v6 = find_available_udp_port(10086).ok_or(anyhow!("no available UDP port"))?;
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_port_v6".to_string(), udp_port_v6.to_string());
    }
    let addr = format!("0.0.0.0:{}", udp_port);
    let mut result = get_user_address_info(addr.clone(), token).await?;
    let addr_json = serde_json::to_vec(&result)?;
    let addr_socket: SocketAddr = addr.parse()?;
    // 发送udp消息给服务器
    udp_port_forward(addr_socket, UDP_SOCKET.to_string().parse()?, &addr_json).await?;
    udp_port_forward(addr_socket, UDP_SOCKET_2.to_string().parse()?, &addr_json).await?;

    // ipv6连接
    let addr_v6 = format!("[::]:{}", udp_port_v6);
    result.ip_type = 2;
    result.address = addr_v6.clone();
    let addr_json = serde_json::to_vec(&result)?;
    let addr_v6_socket: SocketAddrV6 = addr_v6.parse::<SocketAddrV6>()?;
    let udp_socket_v6 = UDP_SOCKET_V6.parse::<SocketAddrV6>()?;
    let udp_socket_v6_2 = UDP_SOCKET_V6_2.parse::<SocketAddrV6>()?;
    udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6, &addr_json).await.unwrap_or_else(|x| {
        warn!("本机不支持ipv6传输 {}", x);
    });
    udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6_2, &addr_json).await.unwrap_or_else(|x| {
        warn!("本机不支持ipv6传输 {}", x);
    });
    Ok(())
}

/// 发送视频帧信息
pub async fn send_p2p_video_frame_service(
    frame_data: Vec<u8>,
    target_uuid: String,
) -> Result<(), anyhow::Error> {
    info!("帧大小 {}", frame_data.len());
    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let sender = guard.get("uuid").ok_or(anyhow!("no sender"))?.clone();
        sender
    };

    let video_data =
        generate_text_msg(MSG_TYPE_P2P_VIDEO_CALL, frame_data, target_uuid.clone(), sender)?;

    // 发送帧数据
    {
        let send_stream = get_sender(&target_uuid).await?;
        // 锁作用范围最小化
        {
            let mut guard = send_stream.try_lock()?;
            guard.write_all(&video_data).await?;
        }
        Ok(())
    }
}

/// 建立p2p服务端
pub async fn run_p2p_server(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let target_address_info: UserAddressInfo = serde_json::from_slice(&text_quic_msg.raw)?;
    // 打开视频窗口
    if let Some(handle) = APP_HANDLE.get() {
        let p2p_msg = P2pMsg { r#type: P2P_ACCEPT_REQUEST, raw: target_address_info.uuid.clone() };
        handle.emit("listen_p2p_request", serde_json::to_string(&p2p_msg)?)?;
    }
    tokio::spawn(async move {
        info!("收到 {:?}", target_address_info);
        // 开启ipv4服务端
        if target_address_info.ip_type == 1 {
            run_p2p_serer_v4(target_address_info).await.expect("运行ipv4版本p2p服务端失败");
        }
    });
    Ok(())
}

/// 建立p2p客户端
pub async fn run_p2p_client(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    tokio::spawn(async move {
        let target_address_info =
            serde_json::from_slice::<UserAddressInfo>(&text_quic_msg.raw).expect("反序列化失败");
        info!("收到 {:?}", target_address_info);
        // 开启ipv4客户端
        if target_address_info.ip_type == 1 {
            run_p2p_client_v4(target_address_info).await.expect("创建ipv4版p2p客户失败");
        }
    });
    Ok(())
}

/// 创建ipv4服务端
async fn run_p2p_serer_v4(target_address_info: UserAddressInfo) -> Result<(), anyhow::Error> {
    let port = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let res = guard.get("p2p_port_v4").ok_or(anyhow!("no p2p port"))?;
        res.clone()
    };
    let addr = format!("0.0.0.0:{}", port);
    let vec_to = Vec::new();
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    run_server(addr.parse()?).await?;
    Ok(())
}

/// 运行ipv4客户端
async fn run_p2p_client_v4(target_address_info: UserAddressInfo) -> Result<(), anyhow::Error> {
    let port = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let res = guard.get("p2p_port_v4").ok_or(anyhow!("no p2p port"))?;
        res.clone()
    };
    let addr = format!("0.0.0.0:{}", port);
    let vec_to = Vec::new();
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    run_client(addr.parse()?, target_address_info.address.to_string().parse()?).await?;
    Ok(())
}

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
            match get_sender(&uuid).await {
                Ok(sender) => {
                    info!("发送p2p视频配置信息 {}", uuid);
                    let mut guard = sender.try_lock()?;
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

    let text_data = generate_text_msg(
        MSG_TYPE_P2P_TEXT,
        text.into_bytes(),
        target_uuid.clone(),
        sender,
    )?;

    let send_stream = get_sender(&target_uuid).await?;
    {
        let mut guard = send_stream.try_lock()?;
        guard.write_all(&text_data).await?;
    }
    
    info!("p2p文本消息发送完成");
    Ok(())
}

/// 关闭p2p连接，清理资源
pub async fn close_p2p_connection_service(target_uuid: String) -> Result<(), anyhow::Error> {
    info!("关闭p2p连接: {}", target_uuid);
    
    // 设置p2p连接状态为非活跃，停止ping消息
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_active".to_string(), "false".to_string());
    }
    
    // 从P2P_STREAM_SENDER中移除连接
    {
        let mut guard = crate::P2P_STREAM_SENDER.write().await;
        if let Some(stream) = guard.remove(&target_uuid) {
            // 尝试关闭发送流
            let _ = stream.send_stream.lock().await.finish().await;
            info!("已移除p2p发送流: {}", target_uuid);
        }
    }
    
    // 清理GLOBAL_QUIC_USER_INFO中的相关数据
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.remove("p2p_server_model");
        guard.remove("p2p_request_token");
        guard.remove("target_uuid");
        guard.remove("p2p_port_v4");
        guard.remove("p2p_port_v6");
    }
    
    info!("p2p连接资源清理完成");
    Ok(())
}

/// 发送p2p音频数据
/// 用于隐私模式视频聊天中的音频传输
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
    info!("音频帧大小 {}", audio_data.len());
    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };

    let audio_msg =
        generate_text_msg(MSG_TYPE_P2P_AUDIO_DATA, audio_data, target_uuid.clone(), sender)?;

    {
        let send_stream = get_sender(&target_uuid).await?;
        {
            let mut guard = send_stream.try_lock()?;
            guard.write_all(&audio_msg).await?;
        }
        Ok(())
    }
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
            match get_sender(&uuid).await {
                Ok(sender) => {
                    info!("发送p2p媒体配置信息 {}", uuid);
                    let mut guard = sender.try_lock()?;
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
    
    use crate::entity::p2p_models::P2pMediaControlType;
    
    let control_type_enum = match control_type.as_str() {
        "VideoToggle" => P2pMediaControlType::VideoToggle,
        "AudioToggle" => P2pMediaControlType::AudioToggle,
        "Pause" => P2pMediaControlType::Pause,
        "Resume" => P2pMediaControlType::Resume,
        "EndCall" => P2pMediaControlType::EndCall,
        _ => return Err(anyhow!("未知的控制类型: {}", control_type)),
    };
    
    let control = crate::entity::p2p_models::P2pMediaControl {
        control_type: control_type_enum,
        enabled,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    };
    
    let control_vec = serde_json::to_vec(&control)?;
    let sender = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("uuid").ok_or(anyhow!("no sender"))?.clone()
    };
    
    let control_msg = generate_text_msg(
        MSG_TYPE_P2P_MEDIA_CONTROL,
        control_vec,
        target_uuid.clone(),
        sender,
    )?;
    
    let send_stream = get_sender(&target_uuid).await?;
    {
        let mut guard = send_stream.try_lock()?;
        guard.write_all(&control_msg).await?;
    }
    
    info!("媒体控制命令发送完成");
    Ok(())
}

// ==================== 视频通话邀请相关服务 ====================

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
    let invite = crate::entity::p2p_models::P2pVideoCallInvite {
        from_uuid: from_uuid.clone(),
        to_uuid: target_uuid.clone(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        media_config: Some(crate::entity::p2p_models::P2pMediaConfig::default()),
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
    let send_stream = get_sender(&target_uuid).await?;
    {
        let mut guard = send_stream.try_lock()?;
        guard.write_all(&invite_msg).await?;
    }
    
    info!("视频通话邀请发送完成");
    Ok(())
}

/// 发送视频通话响应
/// 当用户接受或拒绝视频通话邀请时发送
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
        Some(serde_json::from_str::<crate::entity::p2p_models::P2pMediaConfig>(&config_str)?)
    } else if accept {
        // 如果接受但没有提供配置，使用默认配置
        Some(crate::entity::p2p_models::P2pMediaConfig::default())
    } else {
        None
    };
    
    // 构造响应消息
    let response = crate::entity::p2p_models::P2pVideoCallResponse {
        from_uuid: from_uuid.clone(),
        to_uuid: target_uuid.clone(),
        accept,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        media_config,
        reject_reason,
    };
    
    // 序列化响应消息
    let response_vec = serde_json::to_vec(&response)?;
    
    // 选择消息类型
    let msg_type = if accept {
        MSG_TYPE_P2P_VIDEO_CALL_ACCEPT
    } else {
        MSG_TYPE_P2P_VIDEO_CALL_REJECT
    };
    
    // 生成P2P消息
    let response_msg = generate_text_msg(
        msg_type,
        response_vec,
        target_uuid.clone(),
        from_uuid,
    )?;
    
    // 发送响应消息
    let send_stream = get_sender(&target_uuid).await?;
    {
        let mut guard = send_stream.try_lock()?;
        guard.write_all(&response_msg).await?;
    }
    
    info!("视频通话响应发送完成");
    Ok(())
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
pub async fn send_p2p_video_call_end_service(
    target_uuid: String,
) -> Result<(), anyhow::Error> {
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
    let send_stream = get_sender(&target_uuid).await?;
    {
        let mut guard = send_stream.try_lock()?;
        guard.write_all(&end_msg).await?;
    }
    
    info!("视频通话结束通知发送完成");
    Ok(())
}
