//! 拉取 /session/list 并把服务端会话状态合并进本地会话表。

use anyhow::anyhow;

use super::types::{SessionListItem, SessionListResponse};
use crate::dao::get_db_client;
use crate::models::dto::http_result::HttpResult;
use crate::service::api_service::{parse_http_result, post_request};
use crate::utils::global_static_str::talk_api_base;
use crate::utils::user_state::get_user_info;

/// 拉取 /session/list 并把服务端状态合并进本地会话表(任务07 §5.6)。
///
/// 返回全量会话 —— 客户端据此做正向追平: 每会话 `target = last_message_id`。
pub(super) async fn refresh_session_list() -> Result<Vec<SessionListItem>, anyhow::Error> {
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
