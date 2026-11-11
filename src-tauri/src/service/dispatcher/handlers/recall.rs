//! 单聊撤回(伪撤回)handler。

use log::{info, warn};

use super::private_chat;
use crate::dao::chat_record_db::{query_chat_record_by_id_from_db, recall_chat_record_db};
use crate::models::bo::recall::{can_recall, parse_recall_target};
use crate::models::bo::text_msg::TextQuicMsg;
use crate::service::user_service::get_user_info;

/// 处理单聊撤回消息（伪撤回）。
///
/// 校验被撤回消息存在且与撤回消息发送者一致，命中则清除其内容并置 `deleted = 1`；
/// 随后把撤回消息本身按普通单聊消息落库、上屏、更新会话（前端识别为撤回提示）。
pub(crate) async fn process_recall_message(
    text_quic_msg: TextQuicMsg,
) -> Result<(), anyhow::Error> {
    let raw_str = String::from_utf8_lossy(&text_quic_msg.raw).to_string();
    let target = match parse_recall_target(&raw_str) {
        Some(target) => target,
        None => {
            warn!("单聊撤回消息载荷解析失败: {}", raw_str);
            return Ok(());
        }
    };
    let me = get_user_info("uuid").await?;
    match query_chat_record_by_id_from_db(&target, &me).await {
        Ok(original) if can_recall(&original.send_user, &text_quic_msg.send_user) => {
            recall_chat_record_db(&target, &text_quic_msg.send_user).await?;
        }
        Ok(_) => info!("单聊撤回校验未通过(非同一发送者): target={}", target),
        Err(_) => info!("单聊撤回目标不存在或已删除: target={}", target),
    }
    private_chat::process_private_chat_message(text_quic_msg).await
}
