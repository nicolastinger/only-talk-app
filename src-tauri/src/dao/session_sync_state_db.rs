use sqlx::Row;

use crate::dao::get_db_client;
use crate::entity::session_sync_state::{BACKFILL_DONE, SessionSyncState};
use crate::utils::time::get_now_time_stamp_as_millis;

fn now_ms() -> Result<i64, anyhow::Error> {
    Ok(get_now_time_stamp_as_millis()?)
}

/// 读取单个会话的水位(不存在返回 None)。
pub async fn get_state(session_uuid: &str) -> Result<Option<SessionSyncState>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let row = sqlx::query_as::<_, SessionSyncState>(
        "SELECT * FROM session_sync_state WHERE session_uuid = ?1",
    )
    .bind(session_uuid)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(row)
}

/// 读取连续前沿 `hist_floor`(NULL/无行 → None)。
pub async fn get_hist_floor(session_uuid: &str) -> Result<Option<i64>, anyhow::Error> {
    Ok(get_state(session_uuid).await?.and_then(|s| s.hist_floor))
}

/// 推进拉取位置(任务12 §4.6): `synced_id` 只前进; `hist_floor` 单调只向下(取 min)。
///
/// 首次插入即建立水位行; `hist_floor` 传 None 表示本批不推进连续前沿。
pub async fn upsert_pull_position(
    session_uuid: &str,
    synced_id: i64,
    hist_floor: Option<i64>,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(
        r#"INSERT INTO session_sync_state (session_uuid, synced_id, hist_floor, backfill, updated_at)
           VALUES (?1, ?2, ?3, 0, ?4)
           ON CONFLICT(session_uuid) DO UPDATE SET
               synced_id  = MAX(synced_id, excluded.synced_id),
               hist_floor = CASE
                   WHEN excluded.hist_floor IS NULL THEN hist_floor
                   WHEN hist_floor IS NULL THEN excluded.hist_floor
                   ELSE MIN(hist_floor, excluded.hist_floor)
               END,
               updated_at = excluded.updated_at"#,
    )
    .bind(session_uuid)
    .bind(synced_id)
    .bind(hist_floor)
    .bind(now_ms()?)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 设置回填完成态(0 未回填 / 1 完成 / 2 跳过); 行不存在则建立。
pub async fn set_backfill_status(session_uuid: &str, backfill: i64) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(
        r#"INSERT INTO session_sync_state (session_uuid, synced_id, hist_floor, backfill, updated_at)
           VALUES (?1, 0, NULL, ?2, ?3)
           ON CONFLICT(session_uuid) DO UPDATE SET
               backfill   = excluded.backfill,
               updated_at = excluded.updated_at"#,
    )
    .bind(session_uuid)
    .bind(backfill)
    .bind(now_ms()?)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 回填完成: 置 `backfill=完成`。
pub async fn complete_backfill(session_uuid: &str) -> Result<(), anyhow::Error> {
    set_backfill_status(session_uuid, BACKFILL_DONE).await
}

/// 缺口检测(任务12 §4.6 唯一有意跨域读): 会话事实 `last_message_id` vs 执行位置 `synced_id`。
///
/// 返回 `(session_uuid, session_type)`: `last_message_id > COALESCE(synced_id, 0)` 的会话。
pub async fn list_gap_sessions(me: &str) -> Result<Vec<(String, i64)>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let rows = sqlx::query(
        r#"SELECT cs.session_uuid AS session_uuid, cs.session_type AS session_type
           FROM chat_session cs
           LEFT JOIN session_sync_state ss ON ss.session_uuid = cs.session_uuid
           WHERE cs.recv_user = ?1
             AND cs.session_uuid IS NOT NULL
             AND cs.last_message_id > COALESCE(ss.synced_id, 0)"#,
    )
    .bind(me)
    .fetch_all(&pool_sqlite)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let session_uuid: String = row.try_get("session_uuid")?;
        let session_type: i64 = row.try_get("session_type")?;
        out.push((session_uuid, session_type));
    }
    Ok(out)
}
