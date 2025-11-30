use log::{error, info, warn};
use quinn::{Endpoint};
use std::net::{SocketAddr, SocketAddrV6, UdpSocket};
use std::sync::{Arc};
use tauri::Emitter;
use tokio::sync::{Mutex};
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO};
use crate::quic_service::dangerous_configuration::configure_server;
use anyhow::anyhow;
use crate::service::user_service::insert_user_info;
use crate::entity::p2p_models::{P2pVideoConfig, UserAddressInfo};
use crate::entity::quic_connection::ConnectionType;
use crate::entity::text_msg::{TextQuicMsg};
use crate::quic_service::models::TargetSendStream;
use crate::quic_service::p2p_service::p2p_quic_service::{process_rec_msg, send_ping_msg, P2P_STREAM_SENDER};
use crate::quic_service::center_service::text_msg_service::get_text_msg;

pub async fn udp_port_forward(local: SocketAddr, remote: SocketAddr, raw: &Vec<u8>) -> Result<(), std::io::Error> {
    // 创建 UDP 套接字，绑定随机本地端口
    {
        let socket = UdpSocket::bind(local)?;
        // 发送 UDP 数据（发送 "ping" 字符串）
        info!("发送ping信息 {}", remote);
        socket.send_to(raw, remote)?;
    }
    info!("发送成功");
    Ok(())
}

pub async fn udp_port_forward_ipv6(local: SocketAddrV6, remote: SocketAddrV6, raw: &Vec<u8>) -> Result<(), std::io::Error> {
    // 创建 UDP 套接字，绑定随机本地端口
    let socket = UdpSocket::bind(local)?;

    // 发送 UDP 数据
    info!("发送ping信息 {}", remote);
    socket.send_to(raw, remote)?;
    info!("发送成功");
    Ok(())
}

pub async fn get_user_address_info(local: String, token: String) -> Result<UserAddressInfo, anyhow::Error> {
    let empty_token = "".to_string();
    let (uuid, target_uuid) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let target_uuid = guard.get("target_uuid").unwrap_or_else(|| &empty_token).clone();
        let uuid = guard.get("uuid").unwrap_or_else(|| &empty_token).clone();
        (uuid, target_uuid)
    };
    let user_address_info = UserAddressInfo {
        uuid,
        address: local.to_string(),
        token,
        ip_type: 1,
        target_uuid,
        nat_type: 4,
        is_server: false,
        lock_uuid: String::new(),
        is_lock: false,
    };
    Ok(user_address_info)
}

pub async fn udp_p2p_port_forward(local: SocketAddr, remote: SocketAddr) -> Result<(), std::io::Error> {
    // 创建 UDP 套接字，绑定随机本地端口
    let socket = UdpSocket::bind(local)?;

    let empty_token = "ping".to_string();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").unwrap_or_else(|| &empty_token).clone();
    // 发送 UDP 数据（发送 "ping" 字符串）
    info!("发送ping信息 {}", remote);
    socket.send_to(token.as_bytes(), remote)?;
    info!("发送成功");
    Ok(())
}

pub async fn run_server(addr: SocketAddr) -> Result<(), anyhow::Error> {
    // 创建服务端端点
    let endpoint = Endpoint::server(
        configure_server(),
        addr,
    )?;

    info!("quic服务器启动 {}", addr);

    // 接受连接
    while let Some(conn) = endpoint.accept().await {
        let connection = conn.await?;
        info!("接收连接来源于 {}", connection.remote_address());

        // 处理连接
        tokio::spawn(async move {
            if let Err(e) = handle_connection(connection).await {
                error!("Connection error: {}", e);
            }
        });
    }

    Ok(())
}

async fn handle_connection(connection: quinn::Connection) -> Result<(), anyhow::Error> {
    // 处理连接逻辑
    while let Ok((mut send, mut recv)) = connection.accept_bi().await {
        let send_stream = Arc::new(Mutex::new(send));
        let target_uuid = {
            let guard = GLOBAL_QUIC_USER_INFO.read().await;
            let target_uuid = guard.get("target_uuid").unwrap();
            target_uuid.clone()
        };
        send_ping_msg(send_stream.clone(), target_uuid.clone());
        {
            let mut guard = P2P_STREAM_SENDER.write().await;
            let target_send_stream = TargetSendStream {
                addr: connection.remote_address().to_string(),
                send_stream: send_stream.clone(),
                is_server: false,
            };
            info!("添加p2p连接 {}", target_uuid);
            guard.insert(target_uuid, target_send_stream);
        }
        let head_length = 9;
        let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
        // 处理双向流
        loop {
            let mut buf = vec![0u8; 1024 * 1024];
            match recv.read(&mut buf).await {
                Ok(Some(n)) => {
                    info!("收到 {} bytes", n);
                    process_rec_msg(&mut buf, n, &ConnectionType::Video, buffer_msg.clone(), head_length).await.expect("处理消息失败");
                }
                Ok(None) => {
                    info!("Stream closed");
                    break;
                }
                Err(e) => {
                    error!("Failed to read from stream: {}", e);
                    break;
                }
            }
        };
        info!("结束p2p服务端连接");
    }
    Ok(())
}
