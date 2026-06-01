use anyhow::anyhow;
use log::{error, info};
use serde::Serialize;
use tauri::Emitter;

use crate::entity::p2p_models::{P2pInitMsg, P2pMsg};
use crate::entity::system_notification::SystemNotification;
use crate::service::p2p_service::check_user_ip_type;
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO};

/// 未读数量变更事件
#[derive(Debug, Clone, Serialize)]
pub struct UnreadCountEvent {
    pub module: String, // "contacts" | "groups"
    pub count: i32,     // 单条通知的未读数
}

/// 向前端发送通知消息（完整数据）
pub fn send_notify_msg(msg: &str) -> Result<(), anyhow::Error> {
    APP_HANDLE.get().ok_or(anyhow!("无法获取app"))?.emit("listen_notify_msg", msg)?;
    Ok(())
}

/// 向前端发送未读数量更新事件
/// 根据 SystemNotification 的 level1/level2 自动判断模块并 emit
pub fn emit_unread_count(notification: &SystemNotification) -> Result<(), anyhow::Error> {
    let level1 = notification.level1.unwrap_or(0);
    let level2 = notification.level2.unwrap_or(0);
    let unread = notification.unread_count.unwrap_or(0);

    // 只处理本系统通知(level1=1)且未读数>0的
    if level1 != 1 || unread <= 0 {
        return Ok(());
    }

    let module = match level2 {
        1 => "contacts",
        3 => "groups",
        _ => {
            info!("未读通知：未知模块 level1={} level2={}", level1, level2);
            return Ok(());
        }
    };

    let event = UnreadCountEvent { module: module.to_string(), count: unread };
    info!("emit 未读数量更新: module={}, count={}", module, unread);
    APP_HANDLE
        .get()
        .ok_or(anyhow!("无法获取app"))?
        .emit("listen_unread_count", event)?;

    Ok(())
}

/// 接收p2p连接请求，向前端发起p2p建立请求
pub async fn process_p2p_msg(p2p_init_msg: P2pInitMsg) -> Result<(), anyhow::Error> {
    // 判断自己是否为发起人,接收人
    info!("process_p2p_msg {:?}", p2p_init_msg);
    let (is_me, req_me) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let me = guard.get("uuid").ok_or_else(|| anyhow!("uuid not found"))?.clone();
        (p2p_init_msg.request_uuid == me, p2p_init_msg.accept_uuid == me)
    };
    info!("is_me: {}, req_me: {}", is_me, req_me);
    match (is_me, req_me) {
        (true, true) => {
            error!("自己不能给自己发请求");
        }
        (true, false) => {
            // 接收用户返回的信息
            match p2p_init_msg.accept {
                true => {
                    // 开始处理p2p通道连接
                    if 2 == p2p_init_msg.step {
                        // 探索本机的ip类型
                        check_user_ip_type().await?;
                    }
                }
                // 用户拒绝建立连接
                false => {
                    let p2p_msg =
                        P2pMsg { r#type: 104, raw: serde_json::to_string(&p2p_init_msg)? };
                    APP_HANDLE
                        .get()
                        .ok_or(anyhow!("无法获取app"))?
                        .emit("listen_p2p_request", serde_json::to_string(&p2p_msg)?)?;
                }
            }
        }
        (false, true) => {
            // 接收到p2p请求
            // 发送数据给前端
            let p2p_msg = P2pMsg { r#type: 102, raw: serde_json::to_string(&p2p_init_msg)? };
            APP_HANDLE
                .get()
                .ok_or(anyhow!("无法获取app"))?
                .emit("listen_p2p_request", serde_json::to_string(&p2p_msg)?)?;
        }
        (false, false) => {
            error!("发错人了")
        }
    }
    Ok(())
}
