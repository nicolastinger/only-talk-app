//! P2P QUIC 收发与媒体通道。
//!
//! - [`sender`]：按目标 + 通道类型取发送流
//! - [`dispatch`]：接收/分发 `TextQuicMsg` 与心跳
//! - [`media`]：MediaData 轻量帧通道(接收循环 / 送帧 / 发送队列)

mod dispatch;
mod media;
mod sender;

pub use dispatch::{process_rec_msg, send_ping_msg};
pub use media::{process_media_data_channel, send_media_frame};
pub use sender::get_sender;

/// MediaData 发送队列容量（帧数）
const MEDIA_SEND_QUEUE_CAPACITY: usize = 64;
