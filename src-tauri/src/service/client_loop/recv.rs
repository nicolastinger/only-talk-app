//! 收包 → 业务分发。

use std::sync::Arc;

use log::{info, warn};
use tokio::sync::Mutex;

use crate::models::bo::quic_connection::ConnectionType;
use crate::quic_core::center_service::text_msg_service::get_text_msg;
use crate::service::dispatcher::process_msg;

/// 处理 bidi/uni recv 数据
pub(super) async fn process_rec_msg(
    buffer: &mut Vec<u8>,
    length: usize,
    msg_type: &ConnectionType,
    buffer_msg: Arc<Mutex<Vec<u8>>>,
    head_length: usize,
) -> anyhow::Result<()> {
    match msg_type {
        ConnectionType::Text => {
            let text_vec = get_text_msg(buffer, length, buffer_msg, head_length).await?;
            info!("服务器返回的消息为 {:?}", text_vec);
            process_msg(text_vec).await?;
        }
        ConnectionType::Img => {}
        _ => {
            warn!("不支持的信息 {:?}", msg_type);
        }
    }
    Ok(())
}
