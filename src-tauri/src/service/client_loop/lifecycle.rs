//! 连接循环的启停与主状态机。

use std::net::SocketAddr;
use std::sync::LazyLock;
use std::time::Duration;

use anyhow::anyhow;
use log::{error, info};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::connect::try_connect_once;
use super::{DISCONNECT_BROADCAST_SECS, HANDSHAKE_TIMEOUT_SECS, RECONNECT_DELAY_SECS};
use crate::dao::app_log_db::log_quic_event;
use crate::models::entity::app_log::{LOG_LEVEL_ERROR, LOG_LEVEL_INFO};
use crate::quic_core::connection_state::{
    current_quic_epoch, invalidate_quic_epoch, QuicConnectionState, GLOBAL_QUIC_STATE,
};
use crate::service::user_service::sync_offline_messages;
use crate::utils::events;
use crate::{GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

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
            // 发送重连事件到前端
            let _ = events::emit("quic_reconnecting", "QUIC 正在重连");
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
                    let _ = events::emit("quic_connected", "QUIC 连接已恢复");
                    // 后台拉取离线消息
                    tokio::spawn(async move {
                        // 通知前端开始同步
                        let _ = events::emit("quic_sync_start", "开始同步离线消息");
                        sync_offline_messages().await;
                        // 通知前端同步完成
                        let _ = events::emit("quic_sync_complete", "离线消息同步完成");
                    });
                    // 消费离线发送队列（重连期间入队的消息，慢速逐条补发）
                    tokio::spawn(async move {
                        crate::service::send_queue::drain_send_queue().await;
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
            tokio::spawn(async move {
                loop {
                    {
                        let state = *GLOBAL_QUIC_STATE.read().await;
                        if state != QuicConnectionState::Disconnected {
                            break; // 状态变更，停止广播
                        }
                    }
                    let _ = events::emit("quic_disconnected", "QUIC 连接已断开，请检查网络环境");
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
