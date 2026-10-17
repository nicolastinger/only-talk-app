//! 服务端强制下线(强退)handler。

use log::info;

use crate::models::bo::text_msg::TextQuicMsg;
use crate::service::user_service::disconnect_quic;
use crate::utils::app_emit;
use crate::utils::jwt::current_token_jti;
use crate::GLOBAL_QUIC_USER_INFO;

/// 处理服务端的同平台挤下线通知。设置 Idle 是为了阻止 run_client 自动重连。
pub(crate) async fn process_force_logout(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let (reason, killer_session) = parse_force_logout_raw(&text_quic_msg.raw);
    info!("收到强制退出通知: {}", reason);

    // 同进程旧连接顶替自己(本机重新登录/刷新 token 后,旧代连接收到自己发起的强退帧):
    // killer 会话等于本机当前 token 的 jti,忽略即可,避免把自己置为 Idle 停掉重连。
    if let Some(killer) = killer_session.as_deref() {
        if current_token_jti().await.as_deref() == Some(killer) {
            info!("强退帧来自本机当前会话,忽略(旧连接顶替自己): killer_session={}", killer);
            return Ok(());
        }
    }

    disconnect_quic().await?;
    GLOBAL_QUIC_USER_INFO.write().await.clear();

    app_emit::emit("force_logout", reason)?;
    Ok(())
}

/// 解析服务端强退帧:JSON {reason, session} 或历史纯文本 reason。
/// 返回 (展示文案, 发起该次强退的会话 jti)。
fn parse_force_logout_raw(raw: &[u8]) -> (String, Option<String>) {
    match serde_json::from_slice::<serde_json::Value>(raw) {
        Ok(value) => {
            let session = value
                .get("session")
                .and_then(|s| s.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let reason = value
                .get("reason")
                .and_then(|r| r.as_str())
                .map(|r| r.to_string())
                .unwrap_or_default();
            if reason.is_empty() {
                (String::from_utf8_lossy(raw).to_string(), session)
            } else {
                (reason, session)
            }
        }
        Err(_) => (String::from_utf8_lossy(raw).to_string(), None),
    }
}
