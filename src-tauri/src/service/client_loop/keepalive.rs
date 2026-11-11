//! 心跳(PING/PONG)与 TTL 续期。

use std::net::SocketAddr;
use std::time::Duration;

use anyhow::{anyhow, Context};
use log::{error, info, warn};
use quinn::Connection;
use tokio::sync::watch;
use uuid::Uuid;

use super::PONG_TIMEOUT_MS;
use crate::dao::app_log_db::log_quic_event;
use crate::models::entity::app_log::{LOG_LEVEL_ERROR, LOG_LEVEL_INFO};
use crate::quic_core::center_service::text_msg_service::generate_text_msg;
use crate::quic_core::connection_state::{QuicConnectionState, GLOBAL_QUIC_STATE};
use crate::service::user_service::{get_user_info, insert_user_info};
use crate::utils::global_static_str::{PING, SYSTEM};
use crate::utils::message_types::{MSG_TYPE_PING, MSG_TYPE_TTL};
use crate::utils::time::get_now_time_stamp_as_millis;

/// 发送心跳（按需开流），检测到断连时通知 disconnect_tx
pub(super) async fn send_ping_msg(
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

/// 发送 TTL 续期需求消息：每 2 分钟携带当前短效 token 经 uni 流发送，
/// 服务端校验 token 有效后续期用户路由 key（替代服务端定时续期）。
/// 连接状态变更（重连/断开）即退出，由新代连接重新启动本任务。
pub(super) async fn send_ttl_renew_msg(conn: Connection) -> Result<(), anyhow::Error> {
    let sender = get_user_info("uuid").await.context("获取uuid失败")?;
    let mut refresh_interval = tokio::time::interval(Duration::from_secs(120));
    loop {
        refresh_interval.tick().await;

        let state = *GLOBAL_QUIC_STATE.read().await;
        if state != QuicConnectionState::Connected {
            info!("连接状态已变更({:?})，TTL 续期任务退出", state);
            break;
        }

        let token = match get_user_info("token").await {
            Ok(t) => t,
            Err(e) => {
                warn!("获取 token 失败，跳过本次 TTL 续期: {}", e);
                continue;
            }
        };
        let mut map = serde_json::Map::new();
        map.insert("token".to_string(), serde_json::Value::String(token));
        let ttl_msg = generate_text_msg(
            MSG_TYPE_TTL,
            serde_json::to_vec(&map)?,
            SYSTEM.to_string(),
            sender.clone(),
        )?;
        match send_via_new_stream(&conn, &ttl_msg).await {
            Ok(_) => info!("TTL 续期需求消息发送成功"),
            Err(e) => warn!("TTL 续期需求消息发送失败: {}", e),
        }
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
