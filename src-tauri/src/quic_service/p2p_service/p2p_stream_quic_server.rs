use std::net::{SocketAddr, SocketAddrV6, UdpSocket};
use std::sync::Arc;

use anyhow::anyhow;
use dashmap::DashMap;
use log::{error, info};
use quinn::Endpoint;
use tokio::sync::Mutex;

use crate::entity::p2p_models::UserAddressInfo;
use crate::entity::quic_connection::ConnectionType;
use crate::quic_service::dangerous_configuration::configure_server;
use crate::quic_service::models::TargetSendStream;
use crate::quic_service::p2p_service::p2p_quic_service::{process_rec_msg, send_ping_msg};
use crate::entity::p2p_models::P2pChannelType;
use crate::{GLOBAL_QUIC_USER_INFO, P2P_STREAM_SENDER};

pub async fn udp_port_forward(
    local: SocketAddr,
    remote: SocketAddr,
    raw: &[u8],
) -> Result<(), std::io::Error> {
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

pub async fn udp_port_forward_ipv6(
    local: SocketAddrV6,
    remote: SocketAddrV6,
    raw: &[u8],
) -> Result<(), std::io::Error> {
    // 创建 UDP 套接字，绑定随机本地端口
    let socket = UdpSocket::bind(local)?;

    // 发送 UDP 数据
    info!("发送ping信息 {}", remote);
    socket.send_to(raw, remote)?;
    info!("发送成功");
    Ok(())
}

pub async fn get_user_address_info(
    local: String,
    token: String,
) -> Result<UserAddressInfo, anyhow::Error> {
    let empty_token = "".to_string();
    let (uuid, target_uuid) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let target_uuid = guard.get("target_uuid").unwrap_or(&empty_token).clone();
        let uuid = guard.get("uuid").unwrap_or(&empty_token).clone();
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

#[allow(dead_code)]
pub async fn udp_p2p_port_forward(
    local: SocketAddr,
    remote: SocketAddr,
) -> Result<(), std::io::Error> {
    // 创建 UDP 套接字，绑定随机本地端口
    let socket = UdpSocket::bind(local)?;

    let empty_token = "ping".to_string();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").unwrap_or(&empty_token).clone();
    // 发送 UDP 数据（发送 "ping" 字符串）
    info!("发送ping信息 {}", remote);
    socket.send_to(token.as_bytes(), remote)?;
    info!("发送成功");
    Ok(())
}

pub async fn run_server(addr: SocketAddr) -> Result<(), anyhow::Error> {
    // 创建服务端端点
    let endpoint = Endpoint::server(configure_server(), addr)?;

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
    let target_uuid = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let target_uuid = guard.get("target_uuid").ok_or(anyhow!("no target uuid"))?;
        target_uuid.clone()
    };

    // 确保P2P_STREAM_SENDER中存在该用户的DashMap
    P2P_STREAM_SENDER.entry(target_uuid.clone()).or_insert_with(DashMap::new);

    // 设置p2p连接活跃状态
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_active".to_string(), "true".to_string());
    }

    // 处理连接逻辑 - 每个双向流作为一个独立的channel
    let mut stream_index: u32 = 0;
    while let Ok((send, mut recv)) = connection.accept_bi().await {
        let send_stream = Arc::new(Mutex::new(send));

        // 按流序号分配通道: 0=Default, 1=MediaInfo, 2=MediaData, 3=File
        let channel_type = match stream_index {
            0 => P2pChannelType::Default,
            1 => P2pChannelType::MediaInfo,
            2 => P2pChannelType::MediaData,
            3 => P2pChannelType::File,
            _ => P2pChannelType::Default, // 后续流默认为Default通道
        };
        let channel_key = channel_type.to_string();

        // 仅对Default通道发送心跳
        if channel_type == P2pChannelType::Default {
            send_ping_msg(send_stream.clone(), target_uuid.clone());
        }

        // 注册发送流到P2P_STREAM_SENDER
        {
            if let Some(user_channels) = P2P_STREAM_SENDER.get(&target_uuid) {
                let target_send_stream = TargetSendStream {
                    addr: connection.remote_address().to_string(),
                    send_stream: send_stream.clone(),
                    is_server: false,
                    channel_type: channel_type.clone(),
                };
                info!("添加p2p连接 {} channel: {}", target_uuid, channel_key);
                user_channels.insert(channel_key, target_send_stream);
            }
        }

        let head_length = 9;
        let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
        // 处理双向流
        loop {
            let mut buf = vec![0u8; 1024 * 1024 * 10];
            match recv.read(&mut buf).await {
                Ok(Some(n)) => {
                    info!("收到 {} bytes on channel {}", n, stream_index);
                    process_rec_msg(
                        &mut buf,
                        n,
                        &ConnectionType::Video,
                        buffer_msg.clone(),
                        head_length,
                    )
                    .await
                    .expect("处理消息失败");
                }
                Ok(None) => {
                    info!("Stream closed on channel {}", stream_index);
                    break;
                }
                Err(e) => {
                    error!("Failed to read from stream on channel {}: {}", stream_index, e);
                    break;
                }
            }
        }
        stream_index += 1;
    }

    // 连接结束后清理该用户的所有channel
    P2P_STREAM_SENDER.remove(&target_uuid);
    info!("结束p2p服务端连接，已清理用户 {} 的所有channel", target_uuid);
    Ok(())
}
