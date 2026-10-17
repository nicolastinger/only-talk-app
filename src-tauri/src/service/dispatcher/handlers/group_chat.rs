//! 群聊消息 handler(含群撤回的伪撤回处理)。

use log::info;

use super::session_update::update_session_list;
use crate::dao::group_chat_record_db::{
    insert_group_chat_record, query_group_chat_record_by_id, recall_group_chat_record_db,
};
use crate::dao::session_db::{query_chat_session_by_user_db, update_chat_session_db};
use crate::models::bo::recall::{can_recall, parse_group_recall_target};
use crate::models::bo::text_msg::TextQuicMsg;
use crate::models::entity::chat_session::ChatSession;
use crate::models::entity::group_chat_record::GroupChatRecord;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::chat_service::{clear_chat_session, create_group_chat_session_service};
use crate::service::dispatcher::alert;
use crate::service::user_service::get_user_info;
use crate::utils::events;
use crate::utils::message_types::CURRENT_SESSION_FRIEND;

/// 处理群聊消息
pub(crate) async fn process_group_chat_message(
    text_quic_msg: TextQuicMsg,
) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let me = get_user_info("uuid").await?;

    // 群聊撤回（伪撤回）：以 2001 承载，解析内层载荷，校验后清除目标消息；
    // 撤回消息本身仍按普通群消息落库/上屏。
    if let Some(target) = parse_group_recall_target(&msg.raw) {
        let group_id = &msg.recv_user;
        match query_group_chat_record_by_id(&target, group_id).await {
            Ok(Some(original)) if can_recall(&original.send_user, &msg.send_user) => {
                recall_group_chat_record_db(&target, group_id, &msg.send_user).await?;
            }
            Ok(_) => info!("群撤回校验未通过或目标不存在: target={}", target),
            Err(e) => info!("群撤回目标查询失败: target={} err={}", target, e),
        }
    }

    let record = GroupChatRecord {
        id: 0,
        nano_id: msg.nano_id.clone(),
        text_type: msg.text_type,
        raw: msg.raw.clone(),
        group_id: msg.recv_user.clone(),
        send_user: msg.send_user.clone(),
        timestamp: msg.timestamp,
        server_id: None,
    };
    insert_group_chat_record(&record).await?;

    let payload = serde_json::to_string(&msg)?;
    events::emit("text_message", payload)?;

    let group_id = &msg.recv_user;
    let current_session = get_user_info(CURRENT_SESSION_FRIEND).await;
    let mut flag = false;
    if let Ok(ref cur) = current_session {
        if cur == group_id {
            flag = true;
        }
    }

    // 新消息到达提醒(系统通知/桌面可点横幅)，不阻塞主流程
    alert::on_incoming_message(&me, &msg, true, flag).await;

    let mut group_session = query_chat_session_by_user_db(&me, group_id).await?;
    if group_session.is_empty() {
        create_group_chat_session_service(group_id.to_string()).await?;
        let mut chat_session = ChatSession {
            id: 0,
            nano_id: msg.nano_id,
            timestamp: msg.timestamp,
            text_type: msg.text_type,
            unread_count: 1,
            last_message: msg.raw,
            recv_user: me.clone(),
            send_user: group_id.clone(),
            session_type: 2,
            is_show: 1,
            is_top: 0,
            group_id: Some(group_id.clone()),
            session_uuid: None,
            last_message_id: 0,
        };
        if flag {
            chat_session.unread_count = 0;
            clear_chat_session(chat_session).await?;
        } else {
            update_session_list(chat_session).await?;
        }
    } else {
        let mut chat_session = group_session.remove(0);
        chat_session.last_message = msg.raw;
        chat_session.timestamp = msg.timestamp;
        chat_session.text_type = msg.text_type;
        chat_session.nano_id = msg.nano_id;
        if flag {
            chat_session.unread_count = 0;
            update_chat_session_db(&chat_session).await?;
            clear_chat_session(chat_session).await?;
        } else {
            chat_session.unread_count = 1;
            update_session_list(chat_session).await?;
        }
    }

    Ok(())
}
