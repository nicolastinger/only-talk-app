use anyhow::anyhow;
use log::{error, info};
use tauri::Emitter;

use crate::entity::p2p_models::{P2pInitMsg, P2pMsg};
use crate::service::p2p_service::check_user_ip_type;
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO};

/// 接收p2p连接请求，向前端发起p2p建立请求
pub async fn process_p2p_msg(p2p_init_msg: P2pInitMsg) -> Result<(), anyhow::Error> {
    // 判断自己是否为发起人,接收人
    info!("process_p2p_msg {:?}", p2p_init_msg);
    let (is_me, req_me) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let me = guard.get("uuid").ok_or_else(|| anyhow!("uuid not found"))?.clone();
        (p2p_init_msg.request_uuid == me, p2p_init_msg.accept_uuid == me)
    };
    match (is_me, req_me) {
        (true, true) => {
            error!("自己不能给自己发请求");
        }
        (true, false) => {
            // 接收用户返回的信息
            match p2p_init_msg.accept {
                true => {
                    // 开始处理p2p通道连接
                    if 2 == p2p_init_msg.step {                         // 探索本机的ip类型
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

/// 发送通知信息给前端
pub fn send_notify_msg(msg: &str) -> Result<(), anyhow::Error> {
    APP_HANDLE.get().ok_or(anyhow!("无法获取app"))?.emit("listen_notify_msg", msg)?;
    Ok(())
}
