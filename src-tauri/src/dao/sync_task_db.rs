use crate::dao::get_db_client;
use crate::entity::sync_task::{
    SYNC_STATUS_FAILED, SYNC_STATUS_PENDING, SYNC_STATUS_RUNNING, SYNC_STATUS_SUCCESS, SyncBatchSummary,
    SyncTask,
};
use crate::utils::time::get_now_time_stamp_as_millis;

fn now_ms() -> Result<i64, anyhow::Error> {
    Ok(get_now_time_stamp_as_millis()?)
}

/// 写入一条会话追平记录(正向追平): 直接以**终态**落库(成功/失败), 非队列。
///
/// `batch_id` = 触发轮次(毫秒), `kind` = SYNC_KIND_FORWARD。
pub async fn record_forward_catchup(
    batch_id: i64,
    session_uuid: &str,
    status: i64,
    batches: i64,
    new_count: i64,
    last_error: Option<&str>,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let now = now_ms()?;
    let attempt = if status == SYNC_STATUS_FAILED { 1 } else { 0 };
    sqlx::query(
        r#"INSERT INTO sync_task
             (batch_id, session_uuid, kind, status, batches, new_count, attempt, last_error, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)"#,
    )
    .bind(batch_id)
    .bind(session_uuid)
    .bind(crate::entity::sync_task::SYNC_KIND_FORWARD)
    .bind(status)
    .bind(batches)
    .bind(new_count)
    .bind(attempt)
    .bind(last_error)
    .bind(now)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 批次保留: 仅清理「不在最新 `keep` 个批次内」的终态记录(全表均为终态, 无队列行)。
pub async fn prune_batches(keep: i64) -> Result<u64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let res = sqlx::query(
        r#"DELETE FROM sync_task
           WHERE batch_id NOT IN (
                 SELECT batch_id FROM sync_task GROUP BY batch_id ORDER BY batch_id DESC LIMIT ?1
             )"#,
    )
    .bind(keep)
    .execute(&pool_sqlite)
    .await?;
    Ok(res.rows_affected())
}

/// 批次视图: `GROUP BY batch_id` 派生成败(不存冗余计数)。
pub async fn history() -> Result<Vec<SyncBatchSummary>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let rows = sqlx::query_as::<_, SyncBatchSummary>(
        r#"SELECT batch_id,
                  COUNT(*) AS total,
                  SUM(CASE WHEN status = ?1 THEN 1 ELSE 0 END) AS success,
                  SUM(CASE WHEN status = ?2 THEN 1 ELSE 0 END) AS failed,
                  SUM(CASE WHEN status IN (?3, ?4) THEN 1 ELSE 0 END) AS pending
           FROM sync_task
           GROUP BY batch_id
           ORDER BY batch_id DESC"#,
    )
    .bind(SYNC_STATUS_SUCCESS)
    .bind(SYNC_STATUS_FAILED)
    .bind(SYNC_STATUS_PENDING)
    .bind(SYNC_STATUS_RUNNING)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(rows)
}

/// 某批次的任务明细(可展开失败会话与原因)。
pub async fn list_batch_tasks(batch_id: i64) -> Result<Vec<SyncTask>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let rows = sqlx::query_as::<_, SyncTask>(
        "SELECT * FROM sync_task WHERE batch_id = ?1 ORDER BY id",
    )
    .bind(batch_id)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(rows)
}