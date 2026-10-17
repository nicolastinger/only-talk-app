//! 按目标 + 通道类型获取 P2P 发送流。

use std::sync::Arc;

use anyhow::anyhow;
use quinn::SendStream;
use tokio::sync::Mutex;

use crate::models::bo::p2p_models::P2pChannelType;
use crate::P2P_STREAM_SENDER;

/// 获取P2P连接的发送流
/// 根据目标用户UUID和通道类型获取对应的QUIC发送流
///
/// # 参数
/// - `target_uuid`: 目标用户UUID
/// - `channel_type`: 通道类型 (Default/MediaInfo)
///
/// # 返回
/// - 成功返回发送流的Arc包装
/// - 失败返回错误信息
pub async fn get_sender(
    target_uuid: &str,
    channel_type: &P2pChannelType,
) -> Result<Arc<Mutex<SendStream>>, anyhow::Error> {
    let channel_key = channel_type.to_string();
    let sender = {
        let user_channels = P2P_STREAM_SENDER
            .get(target_uuid)
            .ok_or(anyhow!("no channels for target: {}", target_uuid))?;
        let target_sender = user_channels.get(&channel_key).ok_or(anyhow!(
            "no sender for channel: {} target: {}",
            channel_key,
            target_uuid
        ))?;
        target_sender.send_stream.clone()
    };
    Ok(sender)
}
