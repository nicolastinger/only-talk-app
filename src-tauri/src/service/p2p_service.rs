use std::collections::HashMap;
use std::io;
use std::net::{SocketAddr, SocketAddrV4, SocketAddrV6, UdpSocket};
use std::time::Duration;

use anyhow::anyhow;
use log::{info, warn};
use nanoid::nanoid;
use tauri::Emitter;

use crate::entity::p2p_models::{P2pInitMsg, P2pMsg, P2pVideoConfig, UserAddressInfo};
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
    MSG_TYPE_P2P, MSG_TYPE_P2P_VIDEO_CALL, MSG_TYPE_P2P_VIDEO_CONFIG, P2P_ACCEPT_REQUEST,
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
    let url = format!("{}/user/add_p2p_token/{}/{}", TALK_API, accept_user, request_token);
    post_with_body(url, HashMap::new()).await?;

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
