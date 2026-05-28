use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context};
use log::{error, info, warn};
use quinn::{Connection, Endpoint, SendStream};
use tauri::Emitter;
use tokio::sync::{watch, Mutex};
use uuid::Uuid;
use crate::entity::quic_connection::{ConnectionType, FirstQuicMsg, QuicConnection};
use crate::quic_service::center_service::process_text_msg_from_server::process_msg;
use crate::quic_service::center_service::text_msg_service::{generate_text_msg, get_text_msg};
use crate::quic_service::connection_state::{QuicConnectionState, GLOBAL_QUIC_STATE};
use crate::quic_service::safe_configuration::configure_client;
use crate::service::user_service::{get_user_info, insert_user_info, sync_offline_messages};
use crate::utils::global_static_str::{PING, SYSTEM};
use crate::utils::message_types::MSG_TYPE_PING;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::{APP_HANDLE, GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

/// 重连间隔（秒）
const RECONNECT_DELAY_SECS: u64 = 5;
/// 断开广播间隔（秒）
const DISCONNECT_BROADCAST_SECS: u64 = 3;

/// 客户端连接主循环（带状态机 + 自动重连）
/// 该函数不返回，持续维护连接
pub async fn run_client(server_addr: SocketAddr) -> Result<(), anyhow::Error> {
    loop {
        // 检查是否需要停止（手动调用 disconnect_quic 会将状态设为 Idle）
        {
            let state = *GLOBAL_QUIC_STATE.read().await;
            if state == QuicConnectionState::Idle {
                info!("QUIC 状态为 Idle，停止重连循环");
                return Ok(());
            }
        }

        // 进入 Connecting 状态
        {
            let mut state = GLOBAL_QUIC_STATE.write().await;
            // 只有从 Disconnected 或 Idle 才允许进入 Connecting
            if *state == QuicConnectionState::Idle {
                return Ok(());
            }
            *state = QuicConnectionState::Connecting;
            info!("QUIC 状态: Idle/Disconnected → Connecting");
        }

        // 尝试连接
        match try_connect_once(server_addr).await {
            Ok((_disconnect_rx, _endpoint)) => {
                // 连接成功 → Connected
                {
                    let mut state = GLOBAL_QUIC_STATE.write().await;
                    *state = QuicConnectionState::Connected;
                    info!("QUIC 状态: Connecting → Connected");
                    // 发送已连接事件到前端
                    if let Some(handle) = APP_HANDLE.get() {
                        let _ = handle.emit("quic_connected", "QUIC 连接已恢复");
                    }
                    // 后台拉取离线消息
                    tokio::spawn(async move {
                        // 通知前端开始同步
                        if let Some(handle) = APP_HANDLE.get() {
                            let _ = handle.emit("quic_sync_start", "开始同步离线消息");
                        }
                        sync_offline_messages().await;
                        // 通知前端同步完成
                        if let Some(handle) = APP_HANDLE.get() {
                            let _ = handle.emit("quic_sync_complete", "离线消息同步完成");
                        }
                    });
                }

                // 等待断开信号（_endpoint 必须保持存活直到断开）
                let mut rx = _disconnect_rx;
                let _ = rx.changed().await;
                info!("收到断开信号");
                drop(_endpoint);
            }
            Err(e) => {
                error!("QUIC 连接失败: {}", e);
            }
        }

        // 进入 Disconnected 状态
        {
            // 清理连接资源
            {
                let mut server_list = GLOBAL_QUIC_SERVER_LIST.write().await;
                server_list.clear();
            }
            {
                let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
                user_info.insert("ping_lost_count".to_string(), "0".to_string());
            }

            let mut state = GLOBAL_QUIC_STATE.write().await;
            if *state == QuicConnectionState::Idle {
                return Ok(());
            }
            *state = QuicConnectionState::Disconnected;
            info!("QUIC 状态 → Disconnected，{} 秒后重试", RECONNECT_DELAY_SECS);
        }

        // 持续发送断开通知到 React（每 DISCONNECT_BROADCAST_SECS 秒一次）
        {
            let handle = APP_HANDLE.get().cloned();
            tokio::spawn(async move {
                loop {
                    {
                        let state = *GLOBAL_QUIC_STATE.read().await;
                        if state != QuicConnectionState::Disconnected {
                            break; // 状态变更，停止广播
                        }
                    }
                    if let Some(ref h) = handle {
                        let _ = h.emit("quic_disconnected", "QUIC 连接已断开，请检查网络环境");
                    }
                    tokio::time::sleep(Duration::from_secs(DISCONNECT_BROADCAST_SECS)).await;
                }
            });
        }

        // 等待后重试
        tokio::time::sleep(Duration::from_secs(RECONNECT_DELAY_SECS)).await;
    }
}

/// 单次连接尝试，成功则返回 disconnect 信号接收器和 Endpoint（必须保持存活）
async fn try_connect_once(server_addr: SocketAddr) -> Result<(watch::Receiver<bool>, Endpoint), anyhow::Error> {
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
    endpoint.set_default_client_config(configure_client());

    info!("尝试连接到服务器 {}", server_addr);
    let connection = endpoint.connect(server_addr, "onlytalk.local")?.await?;
    info!("[client] connected: addr={}", connection.remote_address());

    // 创建 disconnect 信号通道
    let (disconnect_tx, disconnect_rx) = watch::channel(false);

    // 开启双向流用于初始化和接收
    let (mut send_stream, mut _recv_stream) = connection.open_bi().await?;
    send_stream.set_priority(0)?;
    let head_length = 9;
    let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));

    // bidi recv loop
    {
        let tx = disconnect_tx.clone();
        tokio::spawn(async move {
            let mut buffer = vec![0u8; 1024 * 8];
            loop {
                match _recv_stream.read(&mut buffer).await {
                    Ok(Some(length)) => {
                        match process_rec_msg(
                            &mut buffer, length, &ConnectionType::Text,
                            buffer_msg.clone(), head_length,
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
                        let _ = tx.send(true);
                        break;
                    }
                    Err(e) => {
                        error!("[客户端] bidi recv 读取错误: {} (source: {:?})", e, std::error::Error::source(&e));
                        let _ = tx.send(true);
                        break;
                    }
                }
            }
        });
    }

    // uni stream 接收循环
    {
        let conn_for_uni = connection.clone();
        let tx = disconnect_tx.clone();
        tokio::spawn(async move {
            let uni_buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
            loop {
                match conn_for_uni.accept_uni().await {
                    Ok(mut recv) => {
                        let mut buf = vec![0u8; 1024 * 8];
                        match recv.read(&mut buf).await {
                            Ok(Some(length)) => {
                                let _ = process_rec_msg(
                                    &mut buf, length, &ConnectionType::Text,
                                    uni_buffer_msg.clone(), head_length,
                                )
                                .await;
                            }
                            Ok(None) => {}
                            Err(e) => {
                                error!("[客户端] uni流读取错误: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        error!("[客户端] uni accept 错误: {} (source: {:?})", e, std::error::Error::source(&e));
                        let _ = tx.send(true);
                        break;
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
            let ping_result = send_ping_msg(conn, tx).await;
            if ping_result.is_err() {
                error!("心跳任务异常退出: {}", ping_result.unwrap_err());
            }
        });
    }

    Ok((disconnect_rx, endpoint))
}

/// 发送初始化消息给服务器
async fn init_send_msg(send_stream: &mut SendStream, conn: Connection) -> Result<(), anyhow::Error> {
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

/// 发送心跳（按需开流），检测到断连时通知 disconnect_tx
async fn send_ping_msg(conn: Connection, disconnect_tx: watch::Sender<bool>) -> Result<(), anyhow::Error> {
    let ping_uuid = Uuid::new_v4();
    let ping_uuid = ping_uuid.to_string();
    insert_user_info("ping_uuid", &ping_uuid).await?;

    let sender = get_user_info("uuid").await.context("获取uuid失败")?;
    // 重置心跳丢失计数
    insert_user_info("ping_lost_count", "0").await?;

    // 立即发送一次心跳，确认连接正常
    let ping_msg =
        generate_text_msg(MSG_TYPE_PING, PING.as_bytes().to_vec(), SYSTEM.to_string(), sender.clone())
            .expect("生成心跳消息失败");
    match send_via_new_stream(&conn, &ping_msg).await {
        Ok(_) => {
            info!("初始心跳发送成功");
        }
        Err(e) => {
            error!("初始心跳发送失败: {}", e);
            let _ = disconnect_tx.send(true);
            return Err(anyhow!("初始心跳发送失败: {}", e));
        }
    };

    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        info!("发送quic客户端心跳");

        // 检查心跳实例是否一致
        let current_ping_uuid = get_user_info("ping_uuid").await.unwrap_or_default();
        if ping_uuid != current_ping_uuid {
            info!("心跳实例id已更新，当前任务正常退出");
            break;
        }

        // 检查连接状态
        let state = *GLOBAL_QUIC_STATE.read().await;
        if state != QuicConnectionState::Connected {
            info!("连接状态已变更({:?})，心跳任务退出", state);
            break;
        }

        let ping_lost_count = get_user_info("ping_lost_count").await.unwrap_or("0".to_string());
        let mut ping_lost_count = ping_lost_count.parse::<u64>().unwrap_or(0);

        let ping_msg =
            generate_text_msg(MSG_TYPE_PING, PING.as_bytes().to_vec(), SYSTEM.to_string(), sender.clone())
                .expect("生成心跳消息失败");

        match send_via_new_stream(&conn, &ping_msg).await {
            Ok(_) => {
                info!("心跳发送成功");
                // 重置计数
                if ping_lost_count > 0 {
                    insert_user_info("ping_lost_count", "0").await?;
                }
            }
            Err(e) => {
                ping_lost_count += 1;
                error!("心跳发送失败 (第{}次): {}", ping_lost_count, e);
                insert_user_info("ping_lost_count", &ping_lost_count.to_string()).await?;

                if ping_lost_count > 3 {
                    error!("心跳连续失败超过3次，触发断连");
                    // 通知主循环断开
                    let _ = disconnect_tx.send(true);
                    // 标记用户离线
                    insert_user_info("quic_disconnected", "true").await?;
                    break;
                }
            }
        };
    }
    Ok(())
}

/// 按需开流发送数据
async fn send_via_new_stream(conn: &Connection, data: &[u8]) -> Result<(), anyhow::Error> {
    let mut send = conn.open_uni().await?;
    send.write_all(data).await?;
    send.finish().await?;
    Ok(())
}

/// 处理 bidi/uni recv 数据
async fn process_rec_msg(
    buffer: &mut Vec<u8>,
    length: usize,
    msg_type: &ConnectionType,
    buffer_msg: Arc<Mutex<Vec<u8>>>,
    head_length: usize,
) -> anyhow::Result<()> {
    match msg_type {
        ConnectionType::Text => {
            let text_vec = get_text_msg(buffer, length, buffer_msg, head_length).await?;
            info!("服务器返回的消息为 {:?}", text_vec);
            process_msg(text_vec).await?;
        }
        ConnectionType::Img => {}
        _ => {
            warn!("不支持的信息 {:?}", msg_type);
        }
    }
    Ok(())
}
