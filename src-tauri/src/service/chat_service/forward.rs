use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use super::message_convert::normalize_for_target;
use crate::service::user_service::get_user_info;
use crate::utils::time::get_now_time_stamp_as_millis;

use super::group::send_group_text_msg_service;
use super::send::send_text_msg_service;

/// 逐条转发消息到目标会话（好友或群）。
///
/// 复用原始 raw 中的 `biz_id`，不重新上传图片/文件；每条消息生成新的 `nano_id`
/// 与当前时间戳，按单聊/群聊格式互转后走既有发送管道。
/// 私聊目标由调用方持有 `GLOBAL_MSG_SEND_LOCK`；群聊目标无锁依赖。
pub async fn forward_chat_messages_service(
    messages: Vec<TextQuicMsgVo>,
    target_recv: &str,
    target_group: bool,
) -> Result<(), anyhow::Error> {
    let sender = get_user_info("uuid").await?;
    for origin in messages {
        let (text_type, raw) =
            normalize_for_target(origin.text_type, &origin.raw, target_group, &sender)?;
        let timestamp = get_now_time_stamp_as_millis()?;
        let msg = TextQuicMsgVo {
            nano_id: nanoid::nanoid!(),
            text_type,
            raw,
            recv_user: target_recv.to_string(),
            send_user: String::new(),
            timestamp,
        };
        if target_group {
            send_group_text_msg_service(msg).await?;
        } else {
            send_text_msg_service(msg).await?;
        }
    }
    Ok(())
}
