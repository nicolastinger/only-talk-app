//! 单次连接握手与初始化。

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::anyhow;
use log::{error, info, warn};
use quinn::{Connection, Endpoint, SendStream};
use tokio::sync::{watch, Mutex};

use super::keepalive::{send_ping_msg, send_ttl_renew_msg};
use super::recv::process_rec_msg;
use crate::dao::app_log_db::log_quic_event;
use crate::models::bo::quic_connection::{ConnectionType, FirstQuicMsg, QuicConnection};
use crate::models::entity::app_log::{LOG_LEVEL_ERROR, LOG_LEVEL_INFO, LOG_LEVEL_WARN};
use crate::quic_core::safe_configuration::configure_client;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::{GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

/// 单次连接尝试，成功则返回 disconnect 信号接收器和 Endpoint（必须保持存活）
pub(super) async fn try_connect_once(
    server_addr: SocketAddr,
) -> Result<(watch::Receiver<bool>, Endpoint), anyhow::Error> {
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
    endpoint.set_default_client_config(configure_client());

    info!("尝试连接到服务器 {}", server_addr);
    let connection = endpoint.connect(server_addr, "onlytalk.cn")?.await?;
    info!("[client] connected: addr={}", connection.remote_address());

    // 创建 disconnect 信号通道
    let (disconnect_tx, disconnect_rx) = watch::channel(false);

    // 开启双向流用于初始化和接收
    let (mut send_stream, mut _recv_stream) = connection.open_bi().await?;
    send_stream.set_priority(0)?;
    let head_length = 9;
    let _buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));

    // bidi recv loop
    {
        let tx = disconnect_tx.clone();
        tokio::spawn(async move {
            let mut buffer = vec![0u8; 1024 * 8];
            loop {
                match _recv_stream.read(&mut buffer).await {
                    Ok(Some(length)) => {
                        match process_rec_msg(
                            &mut buffer,
                            length,
                            &ConnectionType::Text,
                            Arc::new(Mutex::new(Vec::new())),
                            head_length,
                        )
                        .await
                        {
                            Ok(_) => {}
                            Err(e) => {
                                error!("处理连接数据失败 {} {}", e, e.backtrace());
                            }
                        };
                    }
                    Ok(None) => {
                        info!("[客户端] bidi recv 流关闭");
                        let _ = log_quic_event(
                            LOG_LEVEL_INFO,
                            "center_client",
                            "[客户端] bidi recv 流关闭",
                            &server_addr.to_string(),
                        )
                        .await;
                        let _ = tx.send(true);
                        break;
                    }
                    Err(e) => {
                        error!(
                            "[客户端] bidi recv 读取错误: {} (source: {:?})",
                            e,
                            std::error::Error::source(&e)
                        );
                        let _ = log_quic_event(
                            LOG_LEVEL_ERROR,
                            "center_client",
                            &format!(
                                "[客户端] bidi recv 读取错误: {} (source: {:?})",
                                e,
                                std::error::Error::source(&e)
                            ),
                            &server_addr.to_string(),
                        )
                        .await;
                        let _ = tx.send(true);
                        break;
                    }
                }
            }
        });
    }

    // uni stream 接收循环（只通过共享断连信号退出，不自行判断错误）
    {
        let conn_for_uni = connection.clone();
        let tx = disconnect_tx.clone();
        tokio::spawn(async move {
            let uni_buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
            let mut disconnect_rx = tx.subscribe();
            loop {
                tokio::select! {
                    // 收到断连信号 → 统一退出
                    _ = disconnect_rx.changed() => {
                        info!("[客户端] uni accept 循环收到断开信号，退出");
                        break;
                    }
                    // 接收服务端单向流
                    result = conn_for_uni.accept_uni() => {
                        match result {
                            Ok(mut recv) => {
                                // 大消息会跨多个QUIC包到达，必须读取完整流后统一处理，
                                // 否则未读余量会触发对端 STOP_SENDING，导致"发送被对端终止"
                                let mut msg_data: Vec<u8> = Vec::new();
                                let mut chunk = vec![0u8; 1024 * 8];
                                loop {
                                    match recv.read(&mut chunk).await {
                                        Ok(Some(n)) => {
                                            msg_data.extend_from_slice(&chunk[..n]);
                                        }
                                        Ok(None) => break,
                                        Err(e) => {
                                            error!("[客户端] uni流读取错误: {}", e);
                                            let _ = log_quic_event(
                                                LOG_LEVEL_ERROR,
                                                "center_client",
                                                &format!("[客户端] uni流读取错误: {}", e),
                                                &server_addr.to_string(),
                                            )
                                            .await;
                                            break;
                                        }
                                    }
                                }
                                if !msg_data.is_empty() {
                                    let msg_len = msg_data.len();
                                    let _ = process_rec_msg(
                                        &mut msg_data, msg_len, &ConnectionType::Text,
                                        uni_buffer_msg.clone(), head_length,
                                    )
                                    .await;
                                }
                            }
                            Err(e) => {
                                // 瞬时错误不退出，等1秒后继续接收
                                // 真正的断连由 bidi recv 或心跳检测 → disconnect_tx 通知退出
                                warn!("[客户端] uni accept 错误: {}, 1秒后重试", e);
                                let _ = log_quic_event(
                                    LOG_LEVEL_WARN,
                                    "center_client",
                                    &format!("[客户端] uni accept 错误: {}, 1秒后重试", e),
                                    &server_addr.to_string(),
                                )
                                .await;
                                tokio::time::sleep(Duration::from_secs(1)).await;
                            }
                        }
                    }
                }
            }
        });
    }

    // 发送初始化消息
    init_send_msg(&mut send_stream, connection.clone()).await?;

    // 保持 bidi send half 存活
    {
        let tx = disconnect_tx.clone();
        tokio::spawn(async move {
            let _keep = send_stream;
            // 等待断开信号，期间保持 send_stream 存活
            let mut rx = tx.subscribe();
            let _ = rx.changed().await;
        });
    }

    // 启动心跳（传入 disconnect_tx）
    {
        let conn = connection.clone();
        let tx = disconnect_tx.clone();
        tokio::spawn(async move {
            let ping_result = send_ping_msg(conn, tx, server_addr).await;
            if let Err(e) = ping_result {
                error!("心跳任务异常退出: {}", e);
            }
        });
    }

    // 启动 TTL 续期需求（每 2 分钟携带短效 token，服务端校验通过后续期路由 key）
    {
        let conn = connection.clone();
        tokio::spawn(async move {
            if let Err(e) = send_ttl_renew_msg(conn).await {
                error!("TTL 续期任务异常退出: {}", e);
            }
        });
    }

    Ok((disconnect_rx, endpoint))
}

/// 发送初始化消息给服务器
async fn init_send_msg(
    send_stream: &mut SendStream,
    conn: Connection,
) -> Result<(), anyhow::Error> {
    let mut first_quic_msg = FirstQuicMsg::new();
    let uuid = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").ok_or(anyhow!("uuid为空"))?.clone();
    let token =
        GLOBAL_QUIC_USER_INFO.read().await.get("token").ok_or(anyhow!("token为空"))?.clone();
    first_quic_msg.dyn_header_size = 9;
    first_quic_msg.uuid = uuid;
    first_quic_msg.text_serde_struct = "user_chat_json".to_string();
    first_quic_msg.token = token;
    send_stream.write_all(serde_json::to_string(&first_quic_msg)?.as_bytes()).await?;

    tokio::time::sleep(Duration::from_secs(1)).await;

    let now = get_now_time_stamp_as_millis().unwrap_or(0);

    let new_connection = QuicConnection {
        is_online: true,
        uuid: first_quic_msg.uuid,
        connection_type: ConnectionType::Text,
        conn: conn.clone(),
        create_time: now as u64,
        update_time: now as u64,
        ipv4addr: "".to_string(),
        ipv6addr: "".to_string(),
    };

    {
        let mut server_book = GLOBAL_QUIC_SERVER_LIST.write().await;
        server_book.insert("SERVER_TEXT".to_string(), new_connection);
    }

    Ok(())
}
