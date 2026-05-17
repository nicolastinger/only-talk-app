use std::sync::Arc;

use quinn::SendStream;
use tokio::sync::Mutex;

use crate::entity::p2p_models::P2pChannelType;

/// P2P发送流
/// 包含QUIC发送流和通道类型信息
#[derive(Debug)]
pub struct TargetSendStream {
    /// 远程地址
    pub addr: String,
    /// QUIC发送流
    pub send_stream: Arc<Mutex<SendStream>>,
    /// 是否为服务端
    pub is_server: bool,
    /// 通道类型
    pub channel_type: P2pChannelType,
}
