//! 同步落地: 消息落库(nano_id 去重 + 回填 server_id)与跨端已读水位回填。

use log::info;
use uuid::Uuid;

use super::types::{SessionListItem, SyncMessage, SyncSession};
use crate::dao::chat_record_db::{
    insert_chat_record, query_chat_record_by_id_from_db, recall_chat_record_db,
    set_chat_record_server_id,
};
use crate::dao::chat_record_read::{
    query_read_watermark, update_last_read_msg, update_reported_position,
};
use crate::dao::get_private_db_client;
use crate::dao::group_chat_record_db::{
    query_group_chat_record_by_id, recall_group_chat_record_db, set_group_server_id,
};
use crate::dao::group_message_read::{
    query_group_message_read, update_group_message_read, update_group_reported_position,
};
use crate::dao::session_db::update_chat_session_db;
use crate::models::bo::recall::{can_recall, parse_group_recall_target, parse_recall_target};
use crate::models::entity::chat_record_read::ChatRecordRead;
use crate::models::entity::chat_session::ChatSession;
use crate::models::entity::group_chat_record::GroupChatRecord;
use crate::models::entity::group_message_read::GroupMessageRead;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::utils::session_uuid::single_session_uuid;

/// 应用一批同步结果: 落库(nano_id 去重) + 回写 server_id + 更新会话表; 返回本批新增消息数。
///
/// `server_last_read_id` 为服务端已读游标: `id <= 该值` 的消息是其他端已读的, 不计入未读角标。
pub(super) async fn apply_sync_session(
    me: &str,
    s: &SyncSession,
    server_last_read_id: i64,
) -> Result<i64, anyhow::Error> {
    let mut new_count = 0i64;
    for msg in &s.messages {
        if s.session_type == 1 {
            if insert_single_sync_message(me, msg, server_last_read_id).await? {
                new_count += 1;
            }
        } else if insert_group_sync_message(me, msg, server_last_read_id).await? {
            new_count += 1;
        }
    }
    Ok(new_count)
}

/// 跨端已读回填: 同步完成后, 把服务端已读游标映射到本地水位(chat_record_read /
/// group_message_read), 使本端 UI 直接呈现其他端已读位置, 后续 /session/read 上报不越位。
///
/// 只在本地无水位或水位比服务端游标更旧时推进 —— 不覆盖本端已读到的更前位置。
/// 回填的水位即服务端已有游标, 同步把 reported 位置(nano_id + timestamp)一并推进到该消息,
/// 避免下次 /session/read 把同一位置重复上报(服务端"未推进"路径)。
pub(super) async fn backfill_read_watermark(
    me: &str,
    s: &SessionListItem,
    last_read_id: i64,
) -> Result<(), anyhow::Error> {
    if last_read_id <= 0 {
        return Ok(());
    }
    let pool = get_private_db_client().await?;
    if s.session_type == 2 {
        let existing = query_group_message_read(&s.session_uuid, me).await?;
        let row: Option<(String, i64)> = sqlx::query_as(
            r#"SELECT nano_id, timestamp FROM group_chat_record WHERE group_id = ?1 AND server_id <= ?2 ORDER BY server_id DESC LIMIT 1"#,
        )
        .bind(&s.session_uuid)
        .bind(last_read_id)
        .fetch_optional(&pool)
        .await?;
        let Some((nano_id, ts)) = row else { return Ok(()) };
        if let Some(existing) = existing {
            if ts <= existing.timestamp {
                return Ok(());
            }
        }
        update_group_message_read(&GroupMessageRead {
            id: 0,
            nano_id: nano_id.clone(),
            group_uuid: s.session_uuid.clone(),
            user_uuid: me.to_string(),
            timestamp: ts,
        })
        .await?;
        update_group_reported_position(&s.session_uuid, me, &nano_id, ts).await?;
    } else {
        let Some(peer) = s.peer_uuid.as_ref().filter(|p| !p.is_empty()) else {
            return Ok(());
        };
        let existing = query_read_watermark(me, peer).await?;
        let row: Option<(String, i64)> = sqlx::query_as(
            r#"SELECT nano_id, timestamp FROM chat_record WHERE ((send_user = ?1 AND recv_user = ?2) OR (send_user = ?2 AND recv_user = ?1)) AND server_id <= ?3 ORDER BY server_id DESC LIMIT 1"#,
        )
        .bind(me)
        .bind(peer)
        .bind(last_read_id)
        .fetch_optional(&pool)
        .await?;
        let Some((nano_id, ts)) = row else { return Ok(()) };
        if let Some(existing) = existing {
            if ts <= existing.timestamp {
                return Ok(());
            }
        }
        update_last_read_msg(&ChatRecordRead {
            id: 0,
            nano_id: nano_id.clone(),
            timestamp: ts,
            recv_user: me.to_string(),
            send_user: peer.clone(),
        })
        .await?;
        update_reported_position(me, peer, &nano_id, ts).await?;
    }
    Ok(())
}

/// 单聊同步消息落库(复用 insert_chat_record 去重链); 返回是否新增。
async fn insert_single_sync_message(
    me: &str,
    msg: &SyncMessage,
    server_last_read_id: i64,
) -> Result<bool, anyhow::Error> {
    let vo = TextQuicMsgVo {
        nano_id: msg.nano_id.clone(),
        text_type: msg.text_type,
        raw: String::from_utf8_lossy(&msg.raw).to_string(),
        recv_user: msg.recv_user.clone(),
        send_user: msg.send_user.clone(),
        timestamp: msg.timestamp,
    };
    // 离线同步的撤回消息：同样需要清除目标消息内容并置 deleted = 1
    if let Some(target) = parse_recall_target(&vo.raw) {
        match query_chat_record_by_id_from_db(&target, me).await {
            Ok(original) if can_recall(&original.send_user, &vo.send_user) => {
                recall_chat_record_db(&target, &vo.send_user).await?;
            }
            _ => info!("同步单聊撤回校验未通过/目标缺失: target={}", target),
        }
    }
    let is_new = insert_chat_record(&vo).await?;
    set_chat_record_server_id(&msg.nano_id, msg.id).await?;

    let peer = if msg.send_user == me { msg.recv_user.clone() } else { msg.send_user.clone() };
    let session_uuid = match (Uuid::parse_str(me), Uuid::parse_str(&peer)) {
        (Ok(a), Ok(b)) => single_session_uuid(&a, &b).to_string(),
        _ => String::new(),
    };
    let is_received = msg.recv_user == me;
    let already_read = msg.id <= server_last_read_id; // 其他端已读的消息不计未读
    let chat_session = ChatSession {
        id: 0,
        nano_id: msg.nano_id.clone(),
        timestamp: msg.timestamp,
        text_type: msg.text_type,
        unread_count: if is_new && is_received && !already_read { 1 } else { 0 },
        last_message: vo.raw.clone(),
        recv_user: me.to_string(),
        send_user: peer,
        session_type: 1,
        is_show: 1,
        is_top: 0,
        group_id: None,
        session_uuid: Some(session_uuid),
        last_message_id: msg.id,
    };
    update_chat_session_db(&chat_session).await?;
    Ok(is_new)
}

/// 群聊同步消息落库(recv_user 即 group_uuid); 返回是否新增。
async fn insert_group_sync_message(
    me: &str,
    msg: &SyncMessage,
    server_last_read_id: i64,
) -> Result<bool, anyhow::Error> {
    let group_id = msg.recv_user.clone();
    let raw = String::from_utf8_lossy(&msg.raw).to_string();
    // 离线同步的群撤回消息：解析内层载荷并清除目标消息
    if let Some(target) = parse_group_recall_target(&raw) {
        match query_group_chat_record_by_id(&target, &group_id).await {
            Ok(Some(original)) if can_recall(&original.send_user, &msg.send_user) => {
                recall_group_chat_record_db(&target, &group_id, &msg.send_user).await?;
            }
            _ => info!("同步群撤回校验未通过/目标缺失: target={}", target),
        }
    }
    let record = GroupChatRecord {
        id: 0,
        nano_id: msg.nano_id.clone(),
        text_type: msg.text_type,
        raw: raw.clone(),
        group_id: group_id.clone(),
        send_user: msg.send_user.clone(),
        timestamp: msg.timestamp,
        server_id: None,
    };
    let is_new = GroupChatRecord::insert(&record).await?;
    set_group_server_id(&msg.nano_id, msg.id).await?;

    let already_read = msg.id <= server_last_read_id; // 其他端已读的消息不计未读
    let chat_session = ChatSession {
        id: 0,
        nano_id: msg.nano_id.clone(),
        timestamp: msg.timestamp,
        text_type: msg.text_type,
        unread_count: if is_new && msg.send_user != me && !already_read { 1 } else { 0 },
        last_message: raw,
        recv_user: me.to_string(),
        send_user: group_id.clone(),
        session_type: 2,
        is_show: 1,
        is_top: 0,
        group_id: Some(group_id.clone()),
        session_uuid: Some(group_id),
        last_message_id: msg.id,
    };
    update_chat_session_db(&chat_session).await?;
    Ok(is_new)
}
