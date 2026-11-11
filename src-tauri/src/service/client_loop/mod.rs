//! QUIC 客户端连接循环。
//!
//! 作为「传输 ↔ 业务」的协调者, 它同时依赖 `quic_core`(握手/收包) 与
//! `service`(入站分发/离线追平), 故留在 `service` 层; 按职责拆分为:
//!
//! - [`lifecycle`]：单例启停 + 连接主循环(状态机/自动重连)
//! - [`connect`]：单次连接握手与初始化消息
//! - [`keepalive`]：心跳(PING/PONG)与 TTL 续期
//! - [`recv`]：收包 → 业务 dispatcher

mod connect;
mod keepalive;
mod lifecycle;
mod recv;

pub use lifecycle::{run_client, spawn_client_loop, stop_client_loop};

/// 重连间隔（秒）
const RECONNECT_DELAY_SECS: u64 = 5;
/// 断开广播间隔（秒）
const DISCONNECT_BROADCAST_SECS: u64 = 3;
/// 单次连接握手超时（秒）：UDP 黑洞/服务端假死时 connect() 不会自然返回，
/// 必须超时兜底，失败后进入 Disconnected → 按 RECONNECT_DELAY_SECS 自动重试
const HANDSHAKE_TIMEOUT_SECS: u64 = 10;
/// PONG 超时（毫秒）：超过该时长未收到服务端 PONG 判定连接异常
const PONG_TIMEOUT_MS: i64 = 50_000;
