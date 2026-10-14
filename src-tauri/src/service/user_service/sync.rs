//! 离线同步（任务12：客户端游标驱动的正向追平）。

use anyhow::anyhow;
use log::{error, info, warn};
use uuid::Uuid;

use crate::dao::chat_record_db::{
    insert_chat_record, local_max_server_id, query_chat_record_by_id_from_db,
    recall_chat_record_db, set_chat_record_server_id,
};
use crate::dao::chat_record_read::{
    query_read_watermark, update_last_read_msg, update_reported_position,
};
use crate::dao::group_chat_record_db::{
    local_max_group_server_id, query_group_chat_record_by_id, recall_group_chat_record_db,
    set_group_server_id,
};
use crate::dao::group_message_read::{
    query_group_message_read, update_group_message_read, update_group_reported_position,
};
use crate::dao::session_db::update_chat_session_db;
use crate::dao::{get_db_client, get_private_db_client};
use crate::models::dto::http_result::HttpResult;
use crate::models::entity::chat_record_read::ChatRecordRead;
use crate::models::entity::chat_session::ChatSession;
use crate::models::entity::group_chat_record::GroupChatRecord;
use crate::models::entity::group_message_read::GroupMessageRead;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::api_service::post_request;
use crate::service::group_service::parse_http_result;
use crate::models::bo::recall::{can_recall, parse_group_recall_target, parse_recall_target};
use crate::utils::global_static_str::talk_api_base;
use crate::utils::session_uuid::single_session_uuid;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::utils::user_state::get_user_info;
use crate::GLOBAL_QUIC_USER_INFO;

use super::read_report::get_unread_notification;

/// 重连后同步离线消息(任务12 简化: 正向追平): 通知 → refresh → 串行逐会话追平。
pub async fn sync_offline_messages() {
    // 设置同步中标志，阻止已读消息发送
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("is_syncing".to_string(), "true".to_string());
    }

    get_unread_notification().await.unwrap_or_else(|e| error!("拉取未读通知失败 {:?}", e));
    refresh_and_forward().await;

    // 同步完成，移除标志
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("is_syncing".to_string(), "false".to_string());
    }
}

/// 刷新会话列表并正向追平离线消息(任务12 简化): 先 `refresh_session_list` 拿到
/// 每个会话服务端最新 id(`last_message_id`), 再 `sync_sessions_forward` 串行追平。
pub(super) async fn refresh_and_forward() {
    match refresh_session_list().await {
        Ok(sessions) => {
            if let Err(e) = sync_sessions_forward(&sessions).await {
                error!("[session][sync] 离线消息正向追平失败 {:?}", e);
            }
        }
        Err(e) => error!("[session][sync] 刷新会话列表失败 {:?}", e),
    }
}

// ===== 任务12: 离线同步(正向追平, 客户端游标驱动) =====

/// 单会话单次正向拉取条数。
const SYNC_PULL_LIMIT: u32 = 100;
/// 追平记录保留批数(每轮重连 = 一批)。
const SYNC_BATCH_KEEP: i64 = 50;

#[derive(Debug, serde::Deserialize)]
struct SyncResponse {
    #[allow(dead_code)]
    server_time: i64,
    sessions: Vec<SyncSession>,
}

#[derive(Debug, serde::Deserialize)]
struct SyncSession {
    #[allow(dead_code)]
    session_uuid: String,
    session_type: i16,
    /// 服务端已读游标(user_session.last_read_id): id <= 该值的消息视为其他端已读, 不计未读
    last_read_id: i64,
    messages: Vec<SyncMessage>,
    next_cursor: i64,
    has_more: bool,
}

#[derive(Debug, serde::Deserialize)]
struct SyncMessage {
    id: i64,
    nano_id: String,
    #[allow(dead_code)]
    session_uuid: String,
    #[allow(dead_code)]
    session_type: i16,
    send_user: String,
    recv_user: String,
    text_type: u16,
    timestamp: i64,
    raw: Vec<u8>,
}

/// 会话列表响应(任务06 §4.1)
#[derive(Debug, serde::Deserialize)]
struct SessionListResponse {
    sessions: Vec<SessionListItem>,
    has_more: bool,
    next_cursor: Option<SessionListCursor>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct SessionListItem {
    session_uuid: String,
    session_type: i16,
    peer_uuid: Option<String>,
    last_message_id: i64,
    last_message_at: i64,
    last_preview: String,
    pinned: i16,
    #[allow(dead_code)]
    muted: i16,
    #[allow(dead_code)]
    unread: i64,
}

#[derive(Debug, serde::Deserialize)]
struct SessionListCursor {
    pinned: i16,
    last_message_at: i64,
    session_uuid: String,
}

/// 正向追平(任务12 简化): 串行遍历会话, 把本地已同步的最新 id(`after_id`)发给服务端,
/// 拉取窗口内 `id > after_id` 的消息, 直到追平服务端最新 id(`last_message_id`)或 7 天窗口尽头。
///
/// 本地前沿 = `chat_record.server_id` / `group_chat_record.server_id` 的最大值(在线 QUIC 消息
/// 无 server_id, 会在此被重新拉取, nano_id 去重兜底并顺带回填 server_id)。
///
/// 每轮 = 一个批次(`batch_id = now`), 每个有增量并尝试追平的会话写一条**终态**记录到
/// `sync_task`(成功/失败), 供前端 `get_sync_history` 查看追平结果。单会话失败不阻断整轮。
async fn sync_sessions_forward(sessions: &[SessionListItem]) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let batch_id = get_now_time_stamp_as_millis()?;
    let mut synced_sessions = 0usize;
    let mut failed_sessions = 0usize;
    for s in sessions {
        let target = s.last_message_id;
        if target <= 0 {
            continue; // 服务端该会话无消息
        }
        // 本地前沿: 单聊按对端、群聊按 group_uuid
        let mine = match s.session_type {
            2 => local_max_group_server_id(&s.session_uuid).await?.unwrap_or(0),
            _ => {
                let Some(peer) = s.peer_uuid.as_ref().filter(|p| !p.is_empty()) else {
                    continue;
                };
                local_max_server_id(&me, peer).await?.unwrap_or(0)
            }
        };
        if target <= mine {
            continue; // 已追平
        }

        let mut after = mine;
        let mut pulled = 0usize;
        let mut total_new = 0i64;
        let mut server_last_read_id = 0i64;
        let pull_result: Result<(), anyhow::Error> = async {
            loop {
                let body = serde_json::json!({
                    "sessions": [{ "session_uuid": s.session_uuid, "after_id": after }],
                    "limit": SYNC_PULL_LIMIT,
                });
                let resp =
                    post_request(format!("{}/session/sync", talk_api_base()), body.to_string())
                        .await
                        .map_err(|e| anyhow!(e))?;
                let result: HttpResult = parse_http_result(&resp.body)?;
                if result.code != 200 || result.data.is_null() {
                    return Err(anyhow!("离线同步响应异常: code={}", result.code));
                }
                let sync: SyncResponse = serde_json::from_value(result.data)?;
                let Some(sess) = sync.sessions.first() else { break };
                if sess.messages.is_empty() {
                    break; // 已追平服务端最新
                }
                server_last_read_id = sess.last_read_id;
                let new_count = apply_sync_session(&me, sess, sess.last_read_id).await?;
                total_new += new_count;
                pulled += 1;
                after = sess.next_cursor;
                if !sess.has_more {
                    break; // 窗口内取尽 → 追平最新 id 或 7 天窗口尽头
                }
            }
            Ok(())
        }
        .await;

        if let Err(e) = pull_result {
            // 单会话失败 → 记失败, 继续下一会话(不阻断整轮)
            failed_sessions += 1;
            error!("[session][sync] 会话追平失败: {}, err={:?}", s.session_uuid, e);
            let _ = crate::dao::sync_task_db::record_forward_catchup(
                batch_id,
                &s.session_uuid,
                crate::models::entity::sync_task::SYNC_STATUS_FAILED,
                pulled as i64,
                total_new,
                Some(&e.to_string()),
            )
            .await;
            continue;
        }

        if pulled > 0 {
            // 撤回核对：按会话全量核对一次（幂等），修正同步批次内"撤回先于原消息"等时序遗漏
            if s.session_type == 2 {
                let _ =
                    crate::service::chat_service::reconcile_group_recalls(&s.session_uuid).await;
            } else if let Some(peer) = s.peer_uuid.as_ref().filter(|p| !p.is_empty()) {
                let _ = crate::service::chat_service::reconcile_single_recalls(&me, peer).await;
            }
            // 跨端已读回填: 把服务端 last_read_id 映射到本地水位(只在本地水位更旧时推进)
            if let Err(e) = backfill_read_watermark(&me, s, server_last_read_id).await {
                warn!("[session][sync] 已读水位回填失败: {}, err={:?}", s.session_uuid, e);
            }
            // 先落库再回报(宁重勿漏; 回报失败 → 下轮重拉, nano_id 去重兜住)
            let report = post_request(
                format!("{}/session/synced", talk_api_base()),
                serde_json::to_string(&serde_json::json!({
                    "sessions": [{ "session_uuid": s.session_uuid, "synced_id": after }]
                }))?,
            )
            .await
            .map_err(|e| anyhow!(e));
            if let Err(e) = report {
                failed_sessions += 1;
                error!("[session][sync] 会话追平回报失败: {}, err={:?}", s.session_uuid, e);
                let _ = crate::dao::sync_task_db::record_forward_catchup(
                    batch_id,
                    &s.session_uuid,
                    crate::models::entity::sync_task::SYNC_STATUS_FAILED,
                    pulled as i64,
                    total_new,
                    Some(&e.to_string()),
                )
                .await;
                continue;
            }
            synced_sessions += 1;
            let _ = crate::dao::sync_task_db::record_forward_catchup(
                batch_id,
                &s.session_uuid,
                crate::models::entity::sync_task::SYNC_STATUS_SUCCESS,
                pulled as i64,
                total_new,
                None,
            )
            .await;
            info!("[session][sync] 会话追平完成: {} (after={})", s.session_uuid, after);
        }
    }
    // 记录有界: 仅保留最近 N 批
    let _ = crate::dao::sync_task_db::prune_batches(SYNC_BATCH_KEEP).await;
    info!(
        "[session][sync] 正向追平完成: {} 个会话有增量, 失败 {} 个",
        synced_sessions, failed_sessions
    );
    Ok(())
}

/// 追平记录批次视图(任务12: `get_sync_history` 命令返回值)。
#[derive(Debug, serde::Serialize)]
pub struct SyncBatchView {
    pub batch_id: i64,
    pub total: i64,
    pub success: i64,
    pub failed: i64,
    pub pending: i64,
    pub tasks: Vec<crate::models::entity::sync_task::SyncTask>,
}

/// 追平记录历史(任务12: `get_sync_history` 命令): 按轮次(batch_id)聚合 + 明细。
pub async fn get_sync_history() -> Result<Vec<SyncBatchView>, anyhow::Error> {
    let summaries = crate::dao::sync_task_db::history().await?;
    let mut out = Vec::with_capacity(summaries.len());
    for s in summaries {
        let tasks = crate::dao::sync_task_db::list_batch_tasks(s.batch_id).await?;
        out.push(SyncBatchView {
            batch_id: s.batch_id,
            total: s.total,
            success: s.success,
            failed: s.failed,
            pending: s.pending,
            tasks,
        });
    }
    Ok(out)
}

/// 应用一批同步结果: 落库(nano_id 去重) + 回写 server_id + 更新会话表; 返回本批新增消息数。
///
/// `server_last_read_id` 为服务端已读游标: `id <= 该值` 的消息是其他端已读的, 不计入未读角标。
async fn apply_sync_session(
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
async fn backfill_read_watermark(
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

/// 拉取 /session/list 并把服务端状态合并进本地会话表(任务07 §5.6)。
///
/// 返回全量会话 —— 客户端据此做正向追平: 每会话 `target = last_message_id`。
async fn refresh_session_list() -> Result<Vec<SessionListItem>, anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let mut all = Vec::new();
    let mut cursor: Option<serde_json::Value> = None;
    loop {
        let body = serde_json::json!({ "cursor": cursor, "size": 50 });
        let resp = post_request(format!("{}/session/list", talk_api_base()), body.to_string())
            .await
            .map_err(|e| anyhow!(e))?;
        let result: HttpResult = parse_http_result(&resp.body)?;
        if result.code != 200 || result.data.is_null() {
            break;
        }
        let list: SessionListResponse = serde_json::from_value(result.data)?;
        for s in &list.sessions {
            merge_local_session(&me, s).await?;
            all.push(s.clone());
        }
        if !list.has_more {
            break;
        }
        cursor = list.next_cursor.map(|c| {
            serde_json::json!({
                "pinned": c.pinned,
                "last_message_at": c.last_message_at,
                "session_uuid": c.session_uuid,
            })
        });
        if cursor.is_none() {
            break;
        }
    }
    Ok(all)
}

/// 把一条服务端会话合并进本地 chat_session(不覆盖本地角标; 落会话事实 last_message_id)。
async fn merge_local_session(me: &str, s: &SessionListItem) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let peer_or_group = match s.session_type {
        2 => s.session_uuid.clone(),
        _ => s.peer_uuid.clone().unwrap_or_default(),
    };
    let group_id = if s.session_type == 2 { Some(s.session_uuid.clone()) } else { None };
    let res = sqlx::query(
        r#"UPDATE chat_session SET session_uuid = ?1, is_top = ?2, last_message = ?3, timestamp = ?4, last_message_id = ?5 WHERE recv_user = ?6 AND send_user = ?7 AND session_type = ?8"#,
    )
    .bind(&s.session_uuid)
    .bind(s.pinned)
    .bind(&s.last_preview)
    .bind(s.last_message_at)
    .bind(s.last_message_id)
    .bind(me)
    .bind(&peer_or_group)
    .bind(s.session_type as i64)
    .execute(&pool_sqlite)
    .await?;
    if res.rows_affected() < 1 {
        // 本地尚无该会话(如好友通过预建、无本地消息): 建一行。
        // 未读播种为 0 —— 新行随后必经 sync 按服务端 last_read_id 重算,
        // 用服务端 unread 播种会与 sync 增量叠加造成双计(任务04跨端)。
        sqlx::query(
            r#"INSERT INTO chat_session (nano_id, timestamp, text_type, unread_count, last_message, send_user, recv_user, session_type, is_show, is_top, group_id, session_uuid, last_message_id) VALUES ('', ?1, 0, 0, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?9)"#,
        )
        .bind(s.last_message_at)
        .bind(&s.last_preview)
        .bind(&peer_or_group)
        .bind(me)
        .bind(s.session_type as i64)
        .bind(s.pinned)
        .bind(&group_id)
        .bind(&s.session_uuid)
        .bind(s.last_message_id)
        .execute(&pool_sqlite)
        .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 任务07 §8.1: /session/sync 响应结构完整解析。
    #[test]
    fn sync_response_parse() {
        let json = r#"{
            "server_time": 1758000000000,
            "sessions": [{
                "session_uuid": "3f2b",
                "session_type": 1,
                "last_read_id": 0,
                "messages": [{
                    "id": 12345,
                    "nano_id": "n1",
                    "session_uuid": "3f2b",
                    "session_type": 1,
                    "send_user": "a",
                    "recv_user": "b",
                    "text_type": 1,
                    "timestamp": 1757999999000,
                    "raw": [104, 105]
                }],
                "next_cursor": 12345,
                "has_more": false
            }]
        }"#;
        let resp: SyncResponse = serde_json::from_str(json).expect("解析 SyncResponse 失败");
        assert_eq!(resp.sessions.len(), 1);
        let s = &resp.sessions[0];
        assert_eq!(s.session_uuid, "3f2b");
        assert_eq!(s.session_type, 1);
        assert_eq!(s.messages.len(), 1);
        assert_eq!(s.messages[0].id, 12345);
        assert_eq!(s.messages[0].raw, vec![104, 105]);
        assert_eq!(s.next_cursor, 12345);
        assert!(!s.has_more);
    }

    /// 任务07 §8.1: /session/list 响应结构完整解析。
    #[test]
    fn session_list_response_parse() {
        let json = r#"{
            "sessions": [{
                "session_uuid": "su1",
                "session_type": 1,
                "peer_uuid": "p1",
                "last_message_id": 9,
                "last_message_at": 1758000000000,
                "last_preview": "hi",
                "pinned": 1,
                "muted": 0,
                "unread": 2
            }],
            "has_more": true,
            "next_cursor": { "pinned": 1, "last_message_at": 1758000000000, "session_uuid": "su1" }
        }"#;
        let resp: SessionListResponse = serde_json::from_str(json).expect("解析 SessionList 失败");
        assert_eq!(resp.sessions.len(), 1);
        assert!(resp.has_more);
        let c = resp.next_cursor.expect("应有游标");
        assert_eq!(c.session_uuid, "su1");
        assert_eq!(c.pinned, 1);
    }
}
