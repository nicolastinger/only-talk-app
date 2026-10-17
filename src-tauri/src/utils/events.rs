//! 前端事件发送端口(中性)。
//!
//! 底层模块(service/quic_core)不直接持有 `AppHandle`, 统一经此端口向前端发事件;
//! 具体实现(emit 到 WebView)由展示层 `emit_app` 在启动时注册, 从而消除
//! `service/quic_core -> emit_app` 的依赖倒置。

use std::sync::OnceLock;

use serde::Serialize;

type EmitFn = dyn Fn(&str, serde_json::Value) -> Result<(), anyhow::Error> + Send + Sync;

static FRONTEND_EMIT: OnceLock<Box<EmitFn>> = OnceLock::new();

/// 注册前端事件发送实现(由 `emit_app` 在启动时调用)。
pub fn register_emit(
    f: impl Fn(&str, serde_json::Value) -> Result<(), anyhow::Error> + Send + Sync + 'static,
) {
    let _ = FRONTEND_EMIT.set(Box::new(f));
}

/// 向前端发送事件。
///
/// 未注册实现时静默跳过(与旧代码 `APP_HANDLE.get()` 判空行为保持一致)。
pub fn emit<S: Serialize>(event: &str, payload: S) -> Result<(), anyhow::Error> {
    let Some(f) = FRONTEND_EMIT.get() else {
        return Ok(());
    };
    let value = serde_json::to_value(payload)?;
    f(event, value)
}
