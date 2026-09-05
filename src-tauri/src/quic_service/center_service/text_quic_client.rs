use std::net::SocketAddr;
use std::sync::LazyLock;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context};
use log::{error, info, warn};
use quinn::{Connection, Endpoint, SendStream};
use tauri::Emitter;
use tokio::sync::{watch, Mutex};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::dao::app_log_db::log_quic_event;
use crate::entity::app_log::{LOG_LEVEL_ERROR, LOG_LEVEL_INFO, LOG_LEVEL_WARN};
use crate::entity::quic_connection::{ConnectionType, FirstQuicMsg, QuicConnection};
use crate::quic_service::center_service::process_text_msg_from_server::process_msg;
use crate::quic_service::center_service::text_msg_service::{generate_text_msg, get_text_msg};
use crate::quic_service::connection_state::{
    QuicConnectionState, current_quic_epoch, invalidate_quic_epoch, GLOBAL_QUIC_STATE,
};
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
/// 单次连接握手超时（秒）：UDP 黑洞/服务端假死时 connect() 不会自然返回，
/// 必须超时兜底，失败后进入 Disconnected → 按 RECONNECT_DELAY_SECS 自动重试
const HANDSHAKE_TIMEOUT_SECS: u64 = 10;
/// PONG 超时（毫秒）：超过该时长未收到服务端 PONG 判定连接异常
const PONG_TIMEOUT_MS: i64 = 50_000;

/// 正在运行中的连接循环（单例）。保证同一时刻只有一代连接存活，
/// 避免“旧代”与“新代”并存被服务端误判为两台设备互相踢下线。
struct RunningLoop {
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

static CURRENT_CLIENT_LOOP: LazyLock<Mutex<Option<RunningLoop>>> =
    LazyLock::new(|| Mutex::new(None));

/// 代次已过期（被取消，或全局代次号已递增）
fn epoch_stale(epoch: u64, cancel: &CancellationToken) -> bool {
    cancel.is_cancelled() || current_quic_epoch() != epoch
}

/// 停止当前连接循环：作废代次 + 取消 in-flight 握手/等待 + 等待旧任务完全退出。
/// 旧任务退出即旧 endpoint 已 drop，旧连接不再存活。
pub async fn stop_client_loop() {
    invalidate_quic_epoch();
    let old = {
        let mut guard = CURRENT_CLIENT_LOOP.lock().await;
        guard.take()
    };
    if let Some(old) = old {
        old.cancel.cancel();
        let _ = old.task.await;
        info!("QUIC 连接循环已停止");
    }
}

/// 启动/重建连接循环（单例）。
/// 先停掉旧代（保证旧连接先于新连接关闭），再启动新代。
pub async fn spawn_client_loop(server_addr: SocketAddr) {
    let mut guard = CURRENT_CLIENT_LOOP.lock().await;
    if let Some(old) = guard.take() {
        invalidate_quic_epoch();
        old.cancel.cancel();
        let _ = old.task.await;
        info!("QUIC 连接循环已重建（旧代已退出）");
    }
    // 递增代次，确保后续任何残留逻辑都判定过期
    invalidate_quic_epoch();
    let epoch = current_quic_epoch();
    let cancel = CancellationToken::new();
    let run_cancel = cancel.clone();
    let task = tokio::spawn(async move {
        if let Err(e) = run_client(server_addr, epoch, run_cancel).await {
            error!("QUIC 连接循环退出: {}", e);
        }
    });
    *guard = Some(RunningLoop { cancel, task });
}

/// 客户端连接主循环（带状态机 + 自动重连）
/// 该函数不返回，持续维护连接。
/// - `epoch`：启动时捕获的代次号，与全局代次不一致即退出（保证单代连接）。
/// - `cancel`：外部断开/重建时取消 in-flight 握手与等待，使旧代快速退出。
pub async fn run_client(
    server_addr: SocketAddr,
    epoch: u64,
    cancel: CancellationToken,
) -> Result<(), anyhow::Error> {
    loop {
        // 检查是否需要停止（手动调用 disconnect_quic 会将状态设为 Idle）
        {
            let state = *GLOBAL_QUIC_STATE.read().await;
            if state == QuicConnectionState::Idle || epoch_stale(epoch, &cancel) {
                info!("QUIC 状态为 Idle 或代次过期，停止重连循环");
                return Ok(());
            }
        }

        // 进入 Connecting 状态
        {
            let mut state = GLOBAL_QUIC_STATE.write().await;
            // 只有从 Disconnected 或 Idle 才允许进入 Connecting
            if *state == QuicConnectionState::Idle || epoch_stale(epoch, &cancel) {
                return Ok(());
            }
            *state = QuicConnectionState::Connecting;
            info!("QUIC 状态: Idle/Disconnected → Connecting");
            let _ = log_quic_event(
                LOG_LEVEL_INFO,
                "center_client",
                "QUIC 状态: Idle/Disconnected → Connecting",
                &server_addr.to_string(),
            )
            .await;
        }

        // 尝试连接（可被取消：取消时丢弃 in-flight 握手与 endpoint；
        // 带握手超时：UDP 黑洞/服务端假死时 connect() 不会自行返回，超时后进入重试）
        let connect_result = tokio::select! {
            _ = cancel.cancelled() => {
                info!("QUIC 连接代次被取消，退出连接循环");
                return Ok(());
            }
            r = tokio::time::timeout(
                Duration::from_secs(HANDSHAKE_TIMEOUT_SECS),
                try_connect_once(server_addr),
            ) => {
                match r {
                    Ok(res) => res,
                    Err(_) => Err(anyhow!(
                        "QUIC 连接握手超时（{}s），服务端可能未响应",
                        HANDSHAKE_TIMEOUT_SECS
                    )),
                }
            }
        };

        // 单次连接结果
        match connect_result {
            Ok((_disconnect_rx, _endpoint)) => {
                // 连接成功，但若代次已过期/已置 Idle，则不应继续使用该连接
                if epoch_stale(epoch, &cancel) {
                    info!("QUIC 连接已建立但代次过期，关闭新连接");
                    drop(_endpoint);
                    return Ok(());
                }
                {
                    let state_now = *GLOBAL_QUIC_STATE.read().await;
                    if state_now == QuicConnectionState::Idle {
                        info!("QUIC 状态已置 Idle，关闭刚建立的连接");
                        drop(_endpoint);
                        return Ok(());
                    }
                }

                // 连接成功 → Connected
                {
                    let mut state = GLOBAL_QUIC_STATE.write().await;
                    *state = QuicConnectionState::Connected;
                    info!("QUIC 状态: Connecting → Connected");
                    let _ = log_quic_event(
                        LOG_LEVEL_INFO,
                        "center_client",
                        "QUIC 状态: Connecting → Connected",
                        &server_addr.to_string(),
                    )
                    .await;
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
                tokio::select! {
                    _ = cancel.cancelled() => {
                        info!("QUIC 代次取消，断开当前连接");
                        drop(_endpoint);
                        return Ok(());
                    }
                    r = rx.changed() => {
                        let _ = r;
                        info!("收到断开信号");
                    }
                }
                drop(_endpoint);
            }
            Err(e) => {
                error!("QUIC 连接失败: {}", e);
                let _ = log_quic_event(
                    LOG_LEVEL_ERROR,
                    "center_client",
                    &format!("QUIC 连接失败: {}", e),
                    &server_addr.to_string(),
                )
                .await;
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
                user_info.insert("last_pong_time".to_string(), "0".to_string());
            }

            let mut state = GLOBAL_QUIC_STATE.write().await;
            if *state == QuicConnectionState::Idle || epoch_stale(epoch, &cancel) {
                return Ok(());
            }
            *state = QuicConnectionState::Disconnected;
            info!("QUIC 状态 → Disconnected，{} 秒后重试", RECONNECT_DELAY_SECS);
            let _ = log_quic_event(
                LOG_LEVEL_INFO,
                "center_client",
                &format!("QUIC 状态 → Disconnected，{} 秒后重试", RECONNECT_DELAY_SECS),
                &server_addr.to_string(),
            )
            .await;
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

        // 等待后重试（可被取消）
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("QUIC 代次取消，退出重连等待");
                return Ok(());
            }
            _ = tokio::time::sleep(Duration::from_secs(RECONNECT_DELAY_SECS)) => {}
        }
    }
}

/// 单次连接尝试，成功则返回 disconnect 信号接收器和 Endpoint（必须保持存活）
async fn try_connect_once(
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
    let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));

    // bidi recv loop
    {
        let tx = disconnect_tx.clone();
        let server_addr = server_addr;
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
        let server_addr = server_addr;
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
        let server_addr = server_addr;
        tokio::spawn(async move {
            let ping_result = send_ping_msg(conn, tx, server_addr).await;
            if ping_result.is_err() {
                error!("心跳任务异常退出: {}", ping_result.unwrap_err());
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

/// 发送心跳（按需开流），检测到断连时通知 disconnect_tx
async fn send_ping_msg(
    conn: Connection,
    disconnect_tx: watch::Sender<bool>,
    server_addr: SocketAddr,
) -> Result<(), anyhow::Error> {
    let remote_addr = server_addr.to_string();
    let ping_uuid = Uuid::new_v4();
    let ping_uuid = ping_uuid.to_string();
    insert_user_info("ping_uuid", &ping_uuid).await?;

    let sender = get_user_info("uuid").await.context("获取uuid失败")?;
    // 重置心跳丢失计数
    insert_user_info("ping_lost_count", "0").await?;

    // 立即发送一次心跳，确认连接正常
    let ping_msg = generate_text_msg(
        MSG_TYPE_PING,
        PING.as_bytes().to_vec(),
        SYSTEM.to_string(),
        sender.clone(),
    )
    .expect("生成心跳消息失败");
    match send_via_new_stream(&conn, &ping_msg).await {
        Ok(_) => {
            info!("初始心跳发送成功");
            let _ =
                log_quic_event(LOG_LEVEL_INFO, "center_client", "初始心跳发送成功", &remote_addr)
                    .await;
            // 初始心跳成功即开始 PONG 超时计时，无需等待首个 PONG 返回
            let now = get_now_time_stamp_as_millis().unwrap_or(0).to_string();
            insert_user_info("last_pong_time", &now).await?;
        }
        Err(e) => {
            error!("初始心跳发送失败: {}", e);
            let _ = log_quic_event(
                LOG_LEVEL_ERROR,
                "center_client",
                &format!("初始心跳发送失败: {}", e),
                &remote_addr,
            )
            .await;
            let _ = disconnect_tx.send(true);
            return Err(anyhow!("初始心跳发送失败: {}", e));
        }
    };

    loop {
        tokio::time::sleep(Duration::from_secs(10)).await;
        info!("发送quic客户端心跳");
        let _ = log_quic_event(LOG_LEVEL_INFO, "center_client", "发送quic客户端心跳", &remote_addr)
            .await;

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

        // 检查是否长时间未收到服务端 PONG（覆盖单向丢包/服务端应用卡死场景）
        let last_pong = get_user_info("last_pong_time").await.unwrap_or_default();
        let last_pong = last_pong.parse::<i64>().unwrap_or(0);
        let now = get_now_time_stamp_as_millis().unwrap_or(0);
        if last_pong > 0 && now - last_pong > PONG_TIMEOUT_MS {
            error!("超过{}秒未收到服务端PONG，判定连接异常", PONG_TIMEOUT_MS / 1000);
            let _ = log_quic_event(
                LOG_LEVEL_ERROR,
                "center_client",
                &format!("超过{}秒未收到服务端PONG，判定连接异常", PONG_TIMEOUT_MS / 1000),
                &remote_addr,
            )
            .await;
            let _ = disconnect_tx.send(true);
            insert_user_info("quic_disconnected", "true").await?;
            break;
        }

        let ping_lost_count = get_user_info("ping_lost_count").await.unwrap_or("0".to_string());
        let mut ping_lost_count = ping_lost_count.parse::<u64>().unwrap_or(0);

        let ping_msg = generate_text_msg(
            MSG_TYPE_PING,
            PING.as_bytes().to_vec(),
            SYSTEM.to_string(),
            sender.clone(),
        )
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
                let _ = log_quic_event(
                    LOG_LEVEL_ERROR,
                    "center_client",
                    &format!("心跳发送失败 (第{}次): {}", ping_lost_count, e),
                    &remote_addr,
                )
                .await;
                insert_user_info("ping_lost_count", &ping_lost_count.to_string()).await?;

                if ping_lost_count > 3 {
                    error!("心跳连续失败超过3次，触发断连");
                    let _ = log_quic_event(
                        LOG_LEVEL_ERROR,
                        "center_client",
                        "心跳连续失败超过3次，触发断连",
                        &remote_addr,
                    )
                    .await;
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
