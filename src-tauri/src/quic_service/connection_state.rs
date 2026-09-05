use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use tokio::sync::RwLock;

/// QUIC 连接状态机
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuicConnectionState {
    /// 初始状态，尚未尝试连接
    Idle,
    /// 正在建立连接
    Connecting,
    /// 连接已建立，正常通信
    Connected,
    /// 连接已断开
    Disconnected,
}

impl QuicConnectionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            QuicConnectionState::Idle => "idle",
            QuicConnectionState::Connecting => "connecting",
            QuicConnectionState::Connected => "connected",
            QuicConnectionState::Disconnected => "disconnected",
        }
    }
}

/// 全局 QUIC 连接状态
pub static GLOBAL_QUIC_STATE: std::sync::LazyLock<Arc<RwLock<QuicConnectionState>>> =
    std::sync::LazyLock::new(|| Arc::new(RwLock::new(QuicConnectionState::Idle)));

/// 连接代次计数：每次“断开/重建”连接 +1。
/// run_client 捕获启动时的代次号，代次不一致即视为过期退出，
/// 保证同一时刻只有一代连接存活，杜绝旧代连接与新代并存导致服务端互相踢下线。
pub static GLOBAL_QUIC_EPOCH: AtomicU64 = AtomicU64::new(0);

/// 使当前连接代次作废（disconnect_quic / reconnect_quic 调用）。
pub fn invalidate_quic_epoch() {
    GLOBAL_QUIC_EPOCH.fetch_add(1, Ordering::SeqCst);
}

/// 当前生效代次号
pub fn current_quic_epoch() -> u64 {
    GLOBAL_QUIC_EPOCH.load(Ordering::SeqCst)
}
