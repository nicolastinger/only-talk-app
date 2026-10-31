use std::net::{SocketAddr, SocketAddrV6, UdpSocket};
use std::sync::Arc;
use std::time::Duration;

use anyhow::anyhow;
use log::{error, info, warn};
use quinn::{Endpoint, RecvStream, SendStream};
use tokio::sync::Mutex;

use crate::models::bo::p2p_models::{P2pChannelType, UserAddressInfo};
use crate::models::bo::quic_connection::ConnectionType;
use crate::models::bo::text_msg::TextQuicMsg;
use crate::models::entity::app_log::{LOG_LEVEL_ERROR, LOG_LEVEL_INFO};
use crate::quic_core::center_service::text_msg_service::get_text_msg;
use crate::quic_core::models::TargetSendStream;
use crate::quic_core::p2p::io::{
    process_media_data_channel, process_msg, process_rec_msg, send_ping_msg,
};
use crate::quic_core::p2p_tls;
use crate::utils::app_log::log_quic_event;
use crate::{GLOBAL_QUIC_USER_INFO, P2P_STREAM_SENDER};

/// 首帧认证超时(秒)：对端连上后必须尽快完成 token 校验
const P2P_AUTH_TIMEOUT_SECS: u64 = 5;
/// 通用消息头长度(HeadMsg)
const P2P_HEAD_LENGTH: usize = 9;

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

pub async fn run_server(
    addr: SocketAddr,
    cert_pem: String,
    key_pem: String,
    expected_token: String,
) -> Result<(), anyhow::Error> {
    // 创建服务端端点(证书由本次 P2P 会话临时生成)
    let endpoint = Endpoint::server(p2p_tls::server_config(&cert_pem, &key_pem)?, addr)?;

    info!("quic服务器启动 {}", addr);
    let _ = log_quic_event(
        LOG_LEVEL_INFO,
        "p2p_server",
        &format!("quic服务器启动 {}", addr),
        &addr.to_string(),
    )
    .await;

    // 接受连接
    while let Some(conn) = endpoint.accept().await {
        // 单个连接握手失败(例如对端证书校验不通过后主动断开)不能影响监听器继续服务
        let connection = match conn.await {
            Ok(connection) => connection,
            Err(e) => {
                warn!("[p2p服务端] QUIC 握手失败, 跳过该连接: {}", e);
                continue;
            }
        };
        let remote_addr = connection.remote_address().to_string();
        info!("接收连接来源于 {}", remote_addr);
        let _ = log_quic_event(
            LOG_LEVEL_INFO,
            "p2p_server",
            &format!("接收连接来源于 {}", remote_addr),
            &remote_addr,
        )
        .await;

        // 处理连接
        let token = expected_token.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_connection(connection, token).await {
                error!("Connection error: {}", e);
                let _ = log_quic_event(
                    LOG_LEVEL_ERROR,
                    "p2p_server",
                    &format!("Connection error: {}", e),
                    &remote_addr,
                )
                .await;
            }
        });
    }

    Ok(())
}

async fn handle_connection(
    connection: quinn::Connection,
    expected_token: String,
) -> Result<(), anyhow::Error> {
    let remote_addr = connection.remote_address().to_string();
    let (my_uuid, target_uuid) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let target_uuid = guard.get("target_uuid").ok_or(anyhow!("no target uuid"))?.clone();
        let my_uuid = guard.get("uuid").ok_or(anyhow!("no uuid"))?.clone();
        (my_uuid, target_uuid)
    };

    // ==================== 首帧认证 ====================
    // 必须在注册流/置活跃状态之前完成，否则陌生连接可以直接写入任意通道
    let (send, mut recv) = match tokio::time::timeout(
        Duration::from_secs(P2P_AUTH_TIMEOUT_SECS),
        connection.accept_bi(),
    )
    .await
    {
        Ok(Ok(pair)) => pair,
        Ok(Err(e)) => {
            connection.close(0_u32.into(), b"p2p auth failed");
            return Err(e.into());
        }
        Err(_) => {
            connection.close(0_u32.into(), b"p2p auth failed");
            return Err(anyhow!("等待 P2P 认证流超时({}s)", P2P_AUTH_TIMEOUT_SECS));
        }
    };
    let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    let auth_msgs = match read_auth_frame(
        &mut recv,
        &my_uuid,
        &target_uuid,
        &expected_token,
        buffer_msg.clone(),
    )
    .await
    {
        Ok(msgs) => msgs,
        Err(e) => {
            error!("[p2p服务端] 首帧认证失败 {}: {}", remote_addr, e);
            let _ = log_quic_event(
                LOG_LEVEL_ERROR,
                "p2p_server",
                &format!("[p2p服务端] 首帧认证失败: {}", e),
                &remote_addr,
            )
            .await;
            connection.close(0_u32.into(), b"p2p auth failed");
            return Err(e);
        }
    };
    info!("[p2p服务端] 首帧认证通过 {}", remote_addr);

    // 确保P2P_STREAM_SENDER中存在该用户的DashMap
    P2P_STREAM_SENDER.entry(target_uuid.clone()).or_default();

    // 设置p2p连接活跃状态(认证通过后才置位)
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_active".to_string(), "true".to_string());
    }

    let _ = log_quic_event(
        LOG_LEVEL_INFO,
        "p2p_server",
        &format!("[p2p服务端] 首帧认证通过 {}", remote_addr),
        &remote_addr,
    )
    .await;

    // 首帧里可能粘包了后续消息(正常只有认证帧)
    if auth_msgs.len() > 1 {
        let rest: Vec<TextQuicMsg> = auth_msgs.into_iter().skip(1).collect();
        if let Err(e) = process_msg(rest).await {
            warn!("[p2p服务端] 处理认证帧附带消息失败: {}", e);
        }
    }

    // 注册 Default 通道(双向流0)并启动接收循环
    register_stream(send, &target_uuid, P2pChannelType::Default, &remote_addr).await;
    spawn_stream_receiver(
        recv,
        P2pChannelType::Default,
        target_uuid.clone(),
        remote_addr.clone(),
        Some(buffer_msg),
    );

    // ==================== 后续通道 ====================
    // 按流序号分配通道: 1=MediaInfo, 2=MediaData, 3=File
    let mut stream_index: u32 = 1;
    while let Ok((send, recv)) = connection.accept_bi().await {
        let channel_type = match stream_index {
            1 => P2pChannelType::MediaInfo,
            2 => P2pChannelType::MediaData,
            3 => P2pChannelType::File,
            _ => P2pChannelType::Default, // 后续流默认为Default通道
        };

        register_stream(send, &target_uuid, channel_type.clone(), &remote_addr).await;
        spawn_stream_receiver(recv, channel_type, target_uuid.clone(), remote_addr.clone(), None);
        stream_index += 1;
    }

    // 连接结束后清理该用户的所有channel
    P2P_STREAM_SENDER.remove(&target_uuid);
    info!("结束p2p服务端连接，已清理用户 {} 的所有channel", target_uuid);
    let _ = log_quic_event(
        LOG_LEVEL_INFO,
        "p2p_server",
        &format!("结束p2p服务端连接，已清理用户 {} 的所有channel", target_uuid),
        &remote_addr,
    )
    .await;
    Ok(())
}

/// 读取并校验首帧认证消息(带超时)。
///
/// 对端在写认证帧后不会 `finish()` 该流(后续还要复用为 Default 通道)，
/// 因此这里按 HeadMsg 长度解析，而不是等待流结束。
async fn read_auth_frame(
    recv: &mut RecvStream,
    my_uuid: &str,
    peer_uuid: &str,
    expected_token: &str,
    buffer_msg: Arc<Mutex<Vec<u8>>>,
) -> Result<Vec<TextQuicMsg>, anyhow::Error> {
    let mut buf = vec![0_u8; 64 * 1024];

    let read = async {
        loop {
            let n = recv
                .read(&mut buf)
                .await
                .map_err(|e| anyhow!("读取 P2P 认证帧失败: {}", e))?
                .ok_or_else(|| anyhow!("对端在认证完成前关闭了连接"))?;

            // 只传入本次读到的字节，避免 get_text_msg 合并缓冲时带入脏数据
            let mut data = buf[..n].to_vec();
            let msgs = get_text_msg(&mut data, n, buffer_msg.clone(), P2P_HEAD_LENGTH).await?;
            if let Some(first) = msgs.first() {
                p2p_tls::verify_auth_frame(
                    first.text_type,
                    &first.raw,
                    &first.send_user,
                    &first.recv_user,
                    my_uuid,
                    peer_uuid,
                    expected_token,
                )?;
                return Ok(msgs);
            }
        }
    };

    match tokio::time::timeout(Duration::from_secs(P2P_AUTH_TIMEOUT_SECS), read).await {
        Ok(result) => result,
        Err(_) => Err(anyhow!("P2P 认证帧读取超时({}s)", P2P_AUTH_TIMEOUT_SECS)),
    }
}

/// 把发送流登记到 P2P_STREAM_SENDER(Default 通道同时启动心跳)
async fn register_stream(
    send: SendStream,
    target_uuid: &str,
    channel_type: P2pChannelType,
    remote_addr: &str,
) {
    let send_stream = Arc::new(Mutex::new(send));
    let channel_key = channel_type.to_string();

    // 仅对Default通道发送心跳
    if channel_type == P2pChannelType::Default {
        send_ping_msg(send_stream.clone(), target_uuid.to_string());
    }

    if let Some(user_channels) = P2P_STREAM_SENDER.get(target_uuid) {
        let target_send_stream = TargetSendStream {
            addr: remote_addr.to_string(),
            send_stream,
            is_server: false,
            channel_type,
        };
        info!("添加p2p连接 {} channel: {}", target_uuid, channel_key);
        let _ = log_quic_event(
            LOG_LEVEL_INFO,
            "p2p_server",
            &format!("添加p2p连接 {} channel: {}", target_uuid, channel_key),
            remote_addr,
        )
        .await;
        user_channels.insert(channel_key, target_send_stream);
    }
}

/// 为一条接收流启动接收循环(MediaData 使用轻量帧格式，其余走通用协议)
fn spawn_stream_receiver(
    mut recv: RecvStream,
    channel_type: P2pChannelType,
    target_uuid: String,
    remote_addr: String,
    buffer_msg: Option<Arc<Mutex<Vec<u8>>>>,
) {
    let channel_key = channel_type.to_string();

    if channel_type == P2pChannelType::MediaData {
        tokio::spawn(async move {
            process_media_data_channel(recv, target_uuid).await;
        });
        return;
    }

    // Default 通道复用认证阶段可能残留的半包缓冲，其余通道新建
    let buffer_msg = buffer_msg.unwrap_or_else(|| Arc::new(Mutex::new(Vec::new())));
    tokio::spawn(async move {
        loop {
            let mut buf = vec![0u8; 1024 * 1024 * 10];
            match recv.read(&mut buf).await {
                Ok(Some(n)) => {
                    if let Err(e) = process_rec_msg(
                        &mut buf,
                        n,
                        &ConnectionType::Video,
                        buffer_msg.clone(),
                        P2P_HEAD_LENGTH,
                    )
                    .await
                    {
                        error!("处理{}通道消息失败: {}", channel_key, e);
                        let _ = log_quic_event(
                            LOG_LEVEL_ERROR,
                            "p2p_server",
                            &format!("处理{}通道消息失败: {}", channel_key, e),
                            &remote_addr,
                        )
                        .await;
                    }
                }
                Ok(None) => {
                    info!("Stream closed on channel {}", channel_key);
                    let _ = log_quic_event(
                        LOG_LEVEL_INFO,
                        "p2p_server",
                        &format!("Stream closed on channel {}", channel_key),
                        &remote_addr,
                    )
                    .await;
                    break;
                }
                Err(e) => {
                    error!("Failed to read from stream on channel {}: {}", channel_key, e);
                    let _ = log_quic_event(
                        LOG_LEVEL_ERROR,
                        "p2p_server",
                        &format!("Failed to read from stream on channel {}: {}", channel_key, e),
                        &remote_addr,
                    )
                    .await;
                    break;
                }
            }
        }
    });
}
