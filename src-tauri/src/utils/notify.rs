//! 系统通知 / 托盘脉冲端口(中性)。
//!
//! 业务层不直接调用 `tauri-plugin-notification` 与托盘, 统一经此端口转发;
//! 具体实现由展示层 `emit_app` 在启动时注册。

use std::sync::OnceLock;

type SystemNotifyFn = dyn Fn(&str, &str, &str) -> Result<(), anyhow::Error> + Send + Sync;
type TrayPulseFn = dyn Fn() + Send + Sync;

static SYSTEM_NOTIFY: OnceLock<Box<SystemNotifyFn>> = OnceLock::new();
static TRAY_PULSE: OnceLock<Box<TrayPulseFn>> = OnceLock::new();

/// 注册系统通知实现(由 `emit_app` 在启动时调用)。
pub fn register_system_notification(
    f: impl Fn(&str, &str, &str) -> Result<(), anyhow::Error> + Send + Sync + 'static,
) {
    let _ = SYSTEM_NOTIFY.set(Box::new(f));
}

/// 注册托盘脉冲实现(由 `emit_app` 在启动时调用)。
pub fn register_tray_pulse(f: impl Fn() + Send + Sync + 'static) {
    let _ = TRAY_PULSE.set(Box::new(f));
}

/// 发送系统通知; `extra_json` 为通知附加数据(JSON 字符串)。未注册时静默跳过。
pub fn show_system_notification(
    title: &str,
    body: &str,
    extra_json: &str,
) -> Result<(), anyhow::Error> {
    let Some(f) = SYSTEM_NOTIFY.get() else {
        return Ok(());
    };
    f(title, body, extra_json)
}

/// 触发托盘新消息提示(仅桌面端实现有效)。
pub fn pulse_tray_on_new_message() {
    if let Some(f) = TRAY_PULSE.get() {
        f();
    }
}
