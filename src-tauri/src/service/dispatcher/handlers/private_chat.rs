//! 单聊消息 handler(文本/图片/文件, 含 self-echo 处理)。

use log::info;

use super::session_update::update_session_list;
use crate::dao::chat_record_db::insert_chat_record;
use crate::dao::friend_db::is_blocked_db;
use crate::dao::session_db::{query_chat_session_by_user_db, update_chat_session_db};
use crate::models::bo::text_msg::TextQuicMsg;
use crate::models::entity::chat_session::ChatSession;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::chat_service::clear_chat_session;
use crate::service::dispatcher::alert;
use crate::service::user_service::get_user_info;
use crate::utils::app_emit;
use crate::utils::message_types::CURRENT_SESSION_FRIEND;

/// 处理单聊消息
pub(crate) async fn process_private_chat_message(
    text_quic_msg: TextQuicMsg,
) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let me = get_user_info("uuid").await?;

    insert_chat_record(&msg).await?;

    // 自己另一台设备同步回推的消息(self-echo)：由 send_user == me 标识，
    // 会话对象是 recv_user，而非 send_user（见下方 peer_uuid）。
    let is_self = msg.send_user == me;

    // 发送者已被拉黑：消息仍落库，但不展示、不进会话列表、不计未读（对方可发送，本地不显示）
    if !is_self && is_blocked_db(&me, &msg.send_user).await? {
        info!("发送者已被拉黑，仅落库不展示: {}", msg.send_user);
        return Ok(());
    }

    let payload = serde_json::to_string(&msg)?;
    info!(
        "emit text_message: is_self={} send_user={} recv_user={} text_type={} nano_id={}",
        is_self, msg.send_user, msg.recv_user, msg.text_type, msg.nano_id
    );
    app_emit::emit("text_message", payload)?;

    // 视频通话控制消息(12-15)不在此提前返回：仍更新会话列表，
    // 便于会话列表预览 [视频通话邀请]/[已接听]/[已拒绝]/[通话结束]（前端聊天窗对 12-15 不渲染气泡）
    // 单聊会话对象：普通入站消息为 send_user（对方），自己另一台设备的回推为 recv_user（对方）。
    let peer_uuid = if is_self { &msg.recv_user } else { &msg.send_user };
    let mut flag = false;
    let current_session_friend = get_user_info(CURRENT_SESSION_FRIEND).await;
    if current_session_friend.is_ok() && current_session_friend? == *peer_uuid {
        flag = true;
    }

    // 新消息到达提醒(系统通知/桌面可点横幅)，不阻塞主流程；自己另一台设备回推的消息不提醒自己
    if !is_self {
        alert::on_incoming_message(&me, &msg, false, flag).await;
    }

    let mut friend_session = query_chat_session_by_user_db(&me, peer_uuid).await?;
    if friend_session.is_empty() {
        // 规范方向入库：recv_user = 我，send_user = 对方
        let mut chat_session = ChatSession {
            id: 0,
            nano_id: msg.nano_id,
            timestamp: msg.timestamp,
            text_type: msg.text_type,
            unread_count: if is_self { 0 } else { 1 },
            last_message: msg.raw,
            recv_user: me.clone(),
            send_user: peer_uuid.clone(),
            session_type: 1,
            is_show: 1,
            is_top: 0,
            group_id: None,
            session_uuid: None,
            last_message_id: 0,
        };
        if is_self {
            // 自己另一台设备回推：仅落库并广播会话事件(type=1, unread_count=0)，
            // 让会话列表实时置顶预览，不依赖轮询/重进刷新
            update_session_list(chat_session).await?;
        } else if flag {
            chat_session.unread_count = 0;
            update_chat_session_db(&chat_session).await?;
            clear_chat_session(chat_session).await?;
        } else {
            update_session_list(chat_session).await?;
        }
    } else {
        let mut chat_session = friend_session.remove(0);
        chat_session.last_message = msg.raw;
        chat_session.timestamp = msg.timestamp;
        chat_session.text_type = msg.text_type;
        chat_session.nano_id = msg.nano_id;
        if is_self {
            // 自己另一台设备回推：更新预览并广播会话事件，未读保持不变(0)
            update_session_list(chat_session).await?;
        } else if flag {
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
