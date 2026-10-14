use anyhow::anyhow;
use log::info;
use serde::Serialize;
use tauri::Emitter;

use crate::entity::system_notification::SystemNotification;
use crate::APP_HANDLE;

/// 未读数量变更事件
#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct UnreadCountEvent {
    pub module: String, // "contacts" | "groups" | "plaza" | "moments"
    pub count: i32,     // 单条通知的未读数
}

/// 向前端发送通知消息（完整数据）
pub fn send_notify_msg(msg: &str) -> Result<(), anyhow::Error> {
    APP_HANDLE.get().ok_or(anyhow!("无法获取app"))?.emit("listen_notify_msg", msg)?;
    Ok(())
}

/// 通知已读/清除后，广播给前端刷新未读角标与通知列表
pub fn emit_notify_read() -> Result<(), anyhow::Error> {
    APP_HANDLE.get().ok_or(anyhow!("无法获取app"))?.emit("listen_notify_read", "notify_read")?;
    Ok(())
}

/// 向前端发送未读数量更新事件
/// 根据 SystemNotification 的 level1/level2 自动判断模块并 emit
#[allow(dead_code)]
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
        4 => "plaza",
        5 => "moments",
        _ => {
            info!("未读通知：未知模块 level1={} level2={}", level1, level2);
            return Ok(());
        }
    };

    let event = UnreadCountEvent { module: module.to_string(), count: unread };
    info!("emit 未读数量更新: module={}, count={}", module, unread);
    APP_HANDLE.get().ok_or(anyhow!("无法获取app"))?.emit("listen_unread_count", event)?;

    Ok(())
}
