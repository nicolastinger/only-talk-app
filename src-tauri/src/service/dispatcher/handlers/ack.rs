//! 消息回执(ack)handler: 单聊 ack 与群聊 ack。

use std::time::Duration;

use anyhow::anyhow;
use log::info;
use tokio::time::timeout;

use super::is_group_message;
use crate::dao::chat_record_ack::update_chat_record_ack;
use crate::dao::chat_record_db::insert_chat_record;
use crate::dao::chat_record_send::{query_record_send_from_db, update_chat_record_send_success};
use crate::dao::group_chat_record_db::insert_group_chat_record;
use crate::dao::group_message_ack::{
    query_group_message_ack_by_local_nano_id, update_group_message_ack_status,
};
use crate::models::bo::text_msg::TextQuicMsg;
use crate::models::entity::chat_session::ChatSession;
use crate::models::entity::group_chat_record::GroupChatRecord;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::chat_service::{clear_chat_session, process_no_send_success_msg};
use crate::utils::app_emit;
use crate::GLOBAL_MSG_SEND_LOCK;

/// 处理ack消息
pub(crate) async fn process_ack_type(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    info!("收到ack消息{:?}", text_quic_msg);
    let msg = TextQuicMsgVo::from(text_quic_msg)?;

    let payload = serde_json::to_string(&msg)?;
    //1.查询ack表中该条消息
    let ack_record = query_record_send_from_db(&msg.raw).await;
    if ack_record.is_err() {
        // P2P信令消息（如视频通话邀请、P2P握手等）不经过chat_service发送流程，
        // 不会在chat_record_send表中留有记录，收到ACK时查不到是正常情况，静默跳过即可
        info!("ACK对应的消息不在发送记录表中(可能是P2P信令消息)，跳过处理: send_id={}", msg.raw);
        return Ok(());
    }
    let ack_record = ack_record?;

    // 检查是否已经处理过该ACK（防止重复处理）
    if ack_record.send_status == 3 {
        info!("消息已经确认过，跳过重复处理: send_id={}", msg.raw);
        return Ok(());
    }

    let text_quic_msg_vo = TextQuicMsgVo {
        nano_id: msg.nano_id,
        text_type: ack_record.text_type,
        raw: ack_record.raw,
        recv_user: ack_record.recv_user,
        send_user: ack_record.send_user,
        timestamp: msg.timestamp,
    };

    // 2.聊天插入数据库（使用INSERT OR IGNORE避免重复插入）
    insert_chat_record(&text_quic_msg_vo).await?;

    // 3. 标记ack表中该条消息为已确认
    update_chat_record_ack(&ack_record.send_id, 1, &text_quic_msg_vo.nano_id).await?;
    // 4. 标记发送列表中某条消息为已确认
    update_chat_record_send_success(&ack_record.send_id, &text_quic_msg_vo.nano_id).await?;

    tokio::spawn(async move {
        // 处理未发送的消息，ack返回
        timeout(Duration::from_secs(10), async {
            let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
            process_no_send_success_msg().await.expect("处理未发送消息失败");
        })
        .await
        .expect("ack返回，处理未发送消息超时");
    });

    // 发送消息给前端
    {
        app_emit::emit("text_message", payload)?;
    }

    // 清除未读计数
    let is_group = is_group_message(&text_quic_msg_vo.recv_user).await;
    let recv_user = text_quic_msg_vo.recv_user.clone();
    let chat_session = ChatSession {
        id: 0,
        nano_id: text_quic_msg_vo.nano_id,
        timestamp: ack_record.timestamp,
        text_type: ack_record.text_type,
        unread_count: 0,
        last_message: text_quic_msg_vo.raw,
        recv_user: text_quic_msg_vo.recv_user,
        send_user: text_quic_msg_vo.send_user,
        session_type: if is_group { 2 } else { 1 },
        is_show: 1,
        is_top: 0,
        group_id: if is_group { Some(recv_user) } else { None },
        session_uuid: None,
        last_message_id: 0,
    };
    clear_chat_session(chat_session).await?;
    Ok(())
}

/// 处理群ack消息
pub(crate) async fn process_group_ack_type(
    text_quic_msg: TextQuicMsg,
) -> Result<(), anyhow::Error> {
    info!("收到群ack消息{:?}", text_quic_msg);
    let msg = TextQuicMsgVo::from(text_quic_msg)?;

    let ack_record = query_group_message_ack_by_local_nano_id(&msg.raw).await?;
    let ack_record =
        ack_record.ok_or_else(|| anyhow!("群ack记录不存在: local_nano_id={}", msg.raw))?;

    if ack_record.ack_status == 1 {
        info!("群消息已经确认过，跳过重复处理: local_nano_id={}", msg.raw);
        return Ok(());
    }

    // ack 成功后插入群聊记录
    let record = GroupChatRecord {
        id: 0,
        nano_id: msg.nano_id.clone(),
        text_type: ack_record.text_type,
        raw: ack_record.raw.clone(),
        group_id: ack_record.group_uuid.clone(),
        send_user: ack_record.send_user.clone(),
        timestamp: ack_record.timestamp,
        server_id: None,
    };
    insert_group_chat_record(&record).await?;

    update_group_message_ack_status(&ack_record.local_nano_id, &msg.nano_id, 1).await?;

    // emit 给前端：通知消息已送达
    let payload = serde_json::to_string(&msg)?;
    app_emit::emit("group_message_ack", payload)?;

    Ok(())
}
