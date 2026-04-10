//TODO p2p内网穿透 客户端

use std::net::SocketAddr;
use std::sync::Arc;

use dashmap::DashMap;
use log::{error, info};
use quinn::{ClientConfig, Endpoint};
use rustls::ClientConfig as RustlsClientConfig;
use tokio::sync::Mutex;

use crate::entity::p2p_models::P2pChannelType;
use crate::entity::quic_connection::ConnectionType;
use crate::quic_service::center_service::text_msg_service::generate_text_msg;
use crate::quic_service::models::TargetSendStream;
use crate::quic_service::p2p_service::p2p_quic_service::{process_rec_msg, send_ping_msg};
use crate::utils::message_types::MSG_TYPE_TEXT;
use crate::{GLOBAL_QUIC_USER_INFO, P2P_STREAM_SENDER};

pub async fn run_client(
    local_addr: SocketAddr,
    server_addr: SocketAddr,
) -> Result<(), anyhow::Error> {
    // 创建客户端端点
    let mut endpoint = Endpoint::client(local_addr)?;

    // 配置客户端
    let mut crypto = RustlsClientConfig::builder()
        .with_safe_defaults()
        .with_root_certificates(rustls::RootCertStore::empty())
        .with_no_client_auth();

    // 禁用证书验证
    crypto.dangerous().set_certificate_verifier(Arc::new(danger::NoCertificateVerification {}));

    let config = ClientConfig::new(Arc::new(crypto));
    endpoint.set_default_client_config(config);

    info!("Connecting to server at {} from local {}", server_addr, local_addr);
    // 连接到服务器
    let connection = endpoint.connect(server_addr, "localhost")?.await?;
    info!("Connected to server at {}", connection.remote_address());

    let (p2p_request_token, target_uuid) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let p2p_request_token = guard.get("p2p_request_token").expect("p2p_request_token");
        let target_uuid = guard.get("target_uuid").expect("target_uuid");
        (p2p_request_token.clone(), target_uuid.clone())
    };
    let ping_uuid = target_uuid.clone();

    // 确保P2P_STREAM_SENDER中存在该用户的DashMap
    P2P_STREAM_SENDER.entry(target_uuid.clone()).or_insert_with(DashMap::new);

    // ==================== 打开Default通道（双向流0） ====================
    let (mut send_default, mut recv_default) = connection.open_bi().await?;

    // 发送验证消息
    let verify_msg = generate_text_msg(
        MSG_TYPE_TEXT,
        serde_json::to_vec(&p2p_request_token)?,
        "".to_string(),
        "".to_string(),
    )?;
    send_default.write_all(&verify_msg).await?;

    let send_stream_default = Arc::new(Mutex::new(send_default));

    {
        if let Some(user_channels) = P2P_STREAM_SENDER.get(&target_uuid) {
            let target_send_stream = TargetSendStream {
                addr: server_addr.to_string(),
                send_stream: send_stream_default.clone(),
                is_server: true,
                channel_type: P2pChannelType::Default,
            };
            info!("[p2p客户端]添加连接 {} channel: default", target_uuid);
            user_channels.insert("default".to_string(), target_send_stream);
        }
    }

    // ==================== 打开MediaInfo通道（双向流1） ====================
    let (send_media_info, mut recv_media_info) = connection.open_bi().await?;
    let send_stream_media_info = Arc::new(Mutex::new(send_media_info));

    {
        if let Some(user_channels) = P2P_STREAM_SENDER.get(&target_uuid) {
            let target_send_stream = TargetSendStream {
                addr: server_addr.to_string(),
                send_stream: send_stream_media_info.clone(),
                is_server: true,
                channel_type: P2pChannelType::MediaInfo,
            };
            info!("[p2p客户端]添加连接 {} channel: media_info", target_uuid);
            user_channels.insert("media_info".to_string(), target_send_stream);
        }
    }

    info!("建立p2p客户端成功! 已建立Default和MediaInfo两个通道");

    // 设置p2p连接活跃状态
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_active".to_string(), "true".to_string());
    }
    // 仅对Default通道发送心跳
    send_ping_msg(send_stream_default.clone(), ping_uuid);

    // ==================== 接收Default通道消息 ====================
    let head_length = 9;
    let buffer_msg_default: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    loop {
        // 接收响应 - 使用10MB缓冲区以容纳视频帧数据
        let mut buf = vec![0u8; 1024 * 1024 * 10];
        match recv_default.read(&mut buf).await {
            Ok(Some(n)) => {
                info!("Received {} bytes on default channel", n);
                process_rec_msg(
                    &mut buf,
                    n,
                    &ConnectionType::Video,
                    buffer_msg_default.clone(),
                    head_length,
                )
                .await
                .expect("处理消息失败");
            }
            Ok(None) => {
                info!("Default channel stream closed");
                break;
            }
            Err(e) => {
                error!("Failed to read from default channel stream: {}", e);
                break;
            }
        }
    }

    // ==================== 接收MediaInfo通道消息 ====================
    // 在单独的任务中处理MediaInfo通道的接收
    let buffer_msg_media: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    tokio::spawn(async move {
        loop {
            let mut buf = vec![0u8; 1024 * 1024]; // 媒体信息通常较小，1MB足够
            match recv_media_info.read(&mut buf).await {
                Ok(Some(n)) => {
                    info!("Received {} bytes on media_info channel", n);
                    if let Err(e) = process_rec_msg(
                        &mut buf,
                        n,
                        &ConnectionType::Video,
                        buffer_msg_media.clone(),
                        head_length,
                    ).await {
                        error!("处理media_info通道消息失败: {}", e);
                    }
                }
                Ok(None) => {
                    info!("Media_info channel stream closed");
                    break;
                }
                Err(e) => {
                    error!("Failed to read from media_info channel stream: {}", e);
                    break;
                }
            }
        }
    });

    Ok(())
}

// 实现不安全的证书验证器
mod danger {
    use std::time::SystemTime;

    use rustls::client::ServerCertVerifier;

    pub struct NoCertificateVerification {}

    impl ServerCertVerifier for NoCertificateVerification {
        fn verify_server_cert(
            &self,
            _end_entity: &rustls::Certificate,
            _intermediates: &[rustls::Certificate],
            _server_name: &rustls::ServerName,
            _scts: &mut dyn Iterator<Item = &[u8]>,
            _ocsp_response: &[u8],
            _now: SystemTime,
        ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
            Ok(rustls::client::ServerCertVerified::assertion())
        }
    }
}
