//! 端口实现注册: 把 `utils` 中的中性端口绑定到具体展示层实现, 供组合根启动时调用。

use anyhow::anyhow;
use tauri::Emitter;
use tauri_plugin_notification::NotificationExt;

use crate::utils::{events, notify};
use crate::APP_HANDLE;

/// 注册前端事件 / 系统通知 / 托盘脉冲 的展示层实现。
pub fn register_ports() {
    events::register_emit(|event, payload| {
        APP_HANDLE.get().ok_or(anyhow!("无法获取app"))?.emit(event, payload)?;
        Ok(())
    });

    notify::register_system_notification(|title, body, extra_json| {
        let app = APP_HANDLE.get().ok_or(anyhow!("无法获取app"))?;
        let extra: serde_json::Value = serde_json::from_str(extra_json)?;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .extra("payload", extra)
            .auto_cancel()
            .show()
            .map_err(|e| anyhow!("发送系统通知失败: {}", e))?;
        Ok(())
    });

    notify::register_tray_pulse(|| {
        #[cfg(desktop)]
        if let Some(app) = APP_HANDLE.get() {
            crate::emit_app::tray::pulse_tray_on_new_message(app);
        }
    });
}
