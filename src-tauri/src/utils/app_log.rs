//! QUIC 事件落库端口(中性)。
//!
//! 协议核 `quic_core` 不直接依赖持久化层 `dao`, 经此端口写 app_log;
//! 具体实现由组合根(`lib.rs`)在启动时注册为 `dao::app_log_db::log_quic_event`。

use std::future::Future;
use std::pin::Pin;
use std::sync::OnceLock;

pub type QuicLogFuture<'a> = Pin<Box<dyn Future<Output = Result<i64, anyhow::Error>> + Send + 'a>>;
type QuicLogFn = for<'a> fn(i32, &'a str, &'a str, &'a str) -> QuicLogFuture<'a>;

static QUIC_LOG: OnceLock<QuicLogFn> = OnceLock::new();

/// 注册 QUIC 日志写入实现(由组合根在启动时调用)。
pub fn register_quic_log(f: QuicLogFn) {
    let _ = QUIC_LOG.set(f);
}

/// 写入一条 QUIC 事件日志; 未注册时返回 0(静默跳过)。
pub async fn log_quic_event(
    level: i32,
    source: &str,
    raw: &str,
    remote_addr: &str,
) -> Result<i64, anyhow::Error> {
    match QUIC_LOG.get() {
        Some(f) => f(level, source, raw, remote_addr).await,
        None => Ok(0),
    }
}
