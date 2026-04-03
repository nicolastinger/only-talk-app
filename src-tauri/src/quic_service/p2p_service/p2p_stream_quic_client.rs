//TODO p2p内网穿透 客户端

use std::net::SocketAddr;
use std::sync::Arc;

use log::{error, info};
use quinn::{ClientConfig, Endpoint};
use rustls::ClientConfig as RustlsClientConfig;
use tokio::sync::Mutex;

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

    // 开启一个双向流
    let (mut send, mut recv) = connection.open_bi().await?;

    let (p2p_request_token, target_uuid) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let p2p_request_token = guard.get("p2p_request_token").expect("p2p_request_token");
        let target_uuid = guard.get("target_uuid").expect("target_uuid");
        (p2p_request_token.clone(), target_uuid.clone())
    };
    let ping_uuid = target_uuid.clone();

    // 发送验证消息
    let verify_msg = generate_text_msg(
        MSG_TYPE_TEXT,
        serde_json::to_vec(&p2p_request_token)?,
        "".to_string(),
        "".to_string(),
    )?;
    send.write_all(&verify_msg).await?;
    //send.finish().await?;

    let send_stream = Arc::new(Mutex::new(send));

    {
        let mut write_guard = P2P_STREAM_SENDER.write().await;
        let target_send_stream = TargetSendStream {
            addr: server_addr.to_string(),
            send_stream: send_stream.clone(),
            is_server: true,
        };
        info!("[p2p客户端]添加连接 {}", target_uuid);
        write_guard.insert(target_uuid, target_send_stream);
    }

    info!("建立p2p客户端成功!");
    // 设置p2p连接活跃状态
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_active".to_string(), "true".to_string());
    }
    send_ping_msg(send_stream.clone(), ping_uuid);
    let head_length = 9;
    let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    loop {
        // 接收响应 - 使用1MB缓冲区以容纳视频帧数据(约230KB/帧)
        let mut buf = vec![0u8; 1024 * 1024 * 10];
        match recv.read(&mut buf).await {
            Ok(Some(n)) => {
                info!("Received {} bytes: {:?}", n, &buf[..n]);
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
                info!("Stream closed");
                break;
            }
            Err(e) => {
                error!("Failed to read from stream: {}", e);
                break;
            }
        }
    }

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
