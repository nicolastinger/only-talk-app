use std::sync::Arc;
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
