//! QUIC 连接生命周期：手动断开、重连、服务器地址发现。

use std::net::SocketAddr;

use log::{info, warn};
use tauri::Emitter;
use uuid::Uuid;

use crate::dao::app_log_db::log_quic_event;
use crate::models::entity::app_log::LOG_LEVEL_INFO;
use crate::quic_core::connection_state::{QuicConnectionState, GLOBAL_QUIC_STATE};
use crate::service::api_service::get_request;
use crate::service::client_loop::{spawn_client_loop, stop_client_loop};
use crate::utils::dns::resolve_ipv4;
use crate::utils::global_static_str::{talk_api_base, talk_api_domain};
use crate::utils::user_state::insert_user_info;
use crate::{APP_HANDLE, GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

/// 断开QUIC连接
/// 设置状态为 Idle 停止重连循环，清理连接资源
pub async fn disconnect_quic() -> Result<(), anyhow::Error> {
    info!("开始断开QUIC连接");
    let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "开始断开QUIC连接", "").await;

    // 设置状态为 Idle，停止 run_client 重连循环
    *GLOBAL_QUIC_STATE.write().await = QuicConnectionState::Idle;

    // 手动断开时主动通知前端，触发 topbar 断连提示
    // （run_client 检测到 Idle 会直接返回，不会进入 Disconnected 广播 quic_disconnected）
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("quic_disconnected", "QUIC 连接已手动断开");
    }

    // 清除服务器连接列表
    {
        let mut server_list = GLOBAL_QUIC_SERVER_LIST.write().await;
        for connection in server_list.values() {
            connection.conn.close(0u32.into(), b"client disconnect");
        }
        server_list.clear();
        info!("已清理QUIC服务器连接列表");
        let _ =
            log_quic_event(LOG_LEVEL_INFO, "user_service", "已清理QUIC服务器连接列表", "").await;
    }

    // 标记用户离线状态
    {
        insert_user_info("quic_disconnected", "true").await?;
        insert_user_info("ping_lost_count", "0").await?;
        insert_user_info("last_pong_time", "0").await?;
        let ping_uuid = Uuid::new_v4();
        let ping_uuid = ping_uuid.to_string();
        insert_user_info("ping_uuid", &ping_uuid).await?;
        info!("已标记QUIC断开状态");
    }

    // 作废代次 + 取消 in-flight 握手/等待，确保连接循环彻底退出（旧 endpoint 已 drop）
    stop_client_loop().await;

    info!("QUIC连接已断开（状态: Idle）");
    let _ =
        log_quic_event(LOG_LEVEL_INFO, "user_service", "QUIC连接已断开（状态: Idle）", "").await;
    Ok(())
}

/// 重新连接QUIC服务
/// 如果 run_client 循环仍在运行，先停止再重启
pub async fn reconnect_quic() -> Result<(), anyhow::Error> {
    info!("开始重新连接QUIC服务");
    let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "开始重新连接QUIC服务", "").await;

    // 先断开现有连接（设 Idle 会停止当前循环）
    disconnect_quic().await?;

    // 清除断开状态标记
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("quic_disconnected".to_string(), "false".to_string());
    }

    // 重新启动连接循环（disconnect_quic 已保证旧循环彻底退出）
    *GLOBAL_QUIC_STATE.write().await = QuicConnectionState::Disconnected;
    tokio::spawn(async move {
        let addr = discover_quic_server_addr().await;
        spawn_client_loop(addr).await;
        info!("QUIC连接循环已启动/重建");
        let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "QUIC连接循环已启动/重建", "").await;
    });

    info!("QUIC重连请求已发送");
    let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "QUIC重连请求已发送", "").await;
    Ok(())
}

/// 通过 HTTP API 发现可用的外网 QUIC 服务器地址
/// 优先从 Redis 获取，失败时回退到 DNS 解析
pub(super) async fn discover_quic_server_addr() -> SocketAddr {
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct QuicServerInfo {
        #[allow(dead_code)]
        index: u32,
        address: String,
    }

    #[derive(Deserialize)]
    struct ApiResult {
        #[allow(dead_code)]
        code: u16,
        data: QuicServerInfo,
    }

    // 尝试通过 API 获取 QUIC 服务器列表
    let url = format!("{}/integrated/quic_servers", talk_api_base());
    match get_request(url).await {
        Ok(response) => match serde_json::from_str::<ApiResult>(&response.body) {
            Ok(result) => {
                let server = result.data;
                info!("通过API发现QUIC服务器: index={} -> {}", server.index, server.address);
                if let Ok(addr) = server.address.parse::<SocketAddr>() {
                    return addr;
                }
                warn!("API返回的QUIC服务器地址无效，回退到DNS解析");
            }
            Err(e) => {
                warn!("解析QUIC服务器列表失败: {}，回退到DNS解析", e);
            }
        },
        Err(e) => {
            warn!("获取QUIC服务器列表失败: {}，回退到DNS解析", e);
        }
    }

    // 回退：DNS 解析默认域名
    SocketAddr::V4(resolve_ipv4(&talk_api_domain(), 4433).await.expect("解析域名失败"))
}
