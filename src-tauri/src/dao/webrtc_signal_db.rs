use crate::dao::get_private_db_client;
use crate::entity::chat_record_raw::{ChatRecordRaw, WebRTCSignalRecord};
use crate::entity::webrtc_signal::WebrtcSignal;
use crate::utils::message_types::MSG_TYPE_WEBRTC_SIGNAL;

/// 插入一条 WebRTC 信令明细到本地
#[allow(clippy::too_many_arguments)]
pub async fn insert_webrtc_signal(
    nano_id: &str,
    session_id: &str,
    msg_type: &str,
    send_user: &str,
    recv_user: &str,
    data: &serde_json::Value,
    timestamp: i64,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"INSERT INTO webrtc_signal (nano_id, session_id, msg_type, send_user, recv_user, data, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#)
        .bind(nano_id)
        .bind(session_id)
        .bind(msg_type)
        .bind(send_user)
        .bind(recv_user)
        .bind(data.to_string())
        .bind(timestamp)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 保存一条 WebRTC 信令：明细始终入库；offer/answer/end 额外更新 chat_record 中的会话摘要
/// （摘要以 `session::<session_id>` 作为稳定 nano_id，配合 INSERT OR REPLACE 随状态更新）
#[allow(clippy::too_many_arguments)]
pub async fn save_webrtc_signal(
    nano_id: &str,
    session_id: &str,
    msg_type: &str,
    send_user: &str,
    recv_user: &str,
    data: &serde_json::Value,
    timestamp: i64,
    prev_id: &str,
) -> Result<(), anyhow::Error> {
    insert_webrtc_signal(nano_id, session_id, msg_type, send_user, recv_user, data, timestamp)
        .await?;

    // candidate / 未知类型 / 空会话 id 不更新会话摘要，仅保留明细
    if session_id.is_empty() || !matches!(msg_type, "offer" | "answer" | "end") {
        return Ok(());
    }

    let pool_sqlite = get_private_db_client().await?;
    let summary_record = WebRTCSignalRecord {
        prev_id: prev_id.to_string(),
        signal_type: msg_type.to_string(),
        sender: send_user.to_string(),
        receiver: recv_user.to_string(),
        session_id: session_id.to_string(),
        data: data.clone(),
        timestamp,
    };
    let raw = summary_record.json_serialize()?;
    let summary_key = format!("session::{}", session_id);

    sqlx::query(r#"INSERT OR REPLACE INTO chat_record (nano_id, raw, timestamp, send_user, recv_user, text_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#)
        .bind(&summary_key)
        .bind(&raw)
        .bind(timestamp)
        .bind(send_user)
        .bind(recv_user)
        .bind(MSG_TYPE_WEBRTC_SIGNAL)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 按会话 id 查询信令明细（升序，用于详情展示）
pub async fn query_webrtc_signal_by_session(
    session_id: &str,
) -> Result<Vec<WebrtcSignal>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record = sqlx::query_as::<_, WebrtcSignal>(
        r#"SELECT * FROM webrtc_signal WHERE session_id = ?1 ORDER BY id ASC"#,
    )
    .bind(session_id)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 查询与某好友最近一次 WebRTC 信令明细（用于最近通话展示）
#[allow(dead_code)]
pub async fn query_latest_webrtc_signal(
    me: &str,
    friend: &str,
) -> Result<Option<WebrtcSignal>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record = sqlx::query_as::<_, WebrtcSignal>(
        r#"SELECT * FROM webrtc_signal WHERE (send_user = ?1 AND recv_user = ?2) OR (send_user = ?2 AND recv_user = ?1) ORDER BY id DESC LIMIT 1"#,
    )
    .bind(me)
    .bind(friend)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(record)
}
