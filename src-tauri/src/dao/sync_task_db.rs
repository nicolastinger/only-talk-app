use crate::dao::get_db_client;
use crate::entity::sync_task::{
    SYNC_STATUS_FAILED, SYNC_STATUS_PENDING, SYNC_STATUS_RUNNING, SYNC_STATUS_SUCCESS, SyncBatchSummary,
    SyncTask,
};
use crate::utils::time::get_now_time_stamp_as_millis;

fn now_ms() -> Result<i64, anyhow::Error> {
    Ok(get_now_time_stamp_as_millis()?)
}

/// 入队一条任务(批次 × 会话)。调用方负责查重(见 `has_pending`)。
pub async fn enqueue(batch_id: i64, session_uuid: &str, kind: i64) -> Result<i64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let now = now_ms()?;
    let res = sqlx::query(
        r#"INSERT INTO sync_task
             (batch_id, session_uuid, kind, status, batches, new_count, attempt, last_error, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 0, 0, 0, NULL, ?5, ?5)"#,
    )
    .bind(batch_id)
    .bind(session_uuid)
    .bind(kind)
    .bind(SYNC_STATUS_PENDING)
    .bind(now)
    .execute(&pool_sqlite)
    .await?;
    Ok(res.last_insert_rowid())
}

/// 是否存在该会话未完成的同类任务(入队查重 / 提示抑制的运行时判断)。
pub async fn has_pending(kind: i64, session_uuid: &str) -> Result<bool, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sync_task WHERE kind = ?1 AND session_uuid = ?2 AND status IN (?3, ?4)",
    )
    .bind(kind)
    .bind(session_uuid)
    .bind(SYNC_STATUS_PENDING)
    .bind(SYNC_STATUS_RUNNING)
    .fetch_one(&pool_sqlite)
    .await?;
    Ok(count > 0)
}

/// 领取一条待执行任务(置为执行中)。单 worker 串行, select→update 足够。
pub async fn claim_pending(kind: i64) -> Result<Option<SyncTask>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let task = sqlx::query_as::<_, SyncTask>(
        "SELECT * FROM sync_task WHERE kind = ?1 AND status = ?2 ORDER BY id LIMIT 1",
    )
    .bind(kind)
    .bind(SYNC_STATUS_PENDING)
    .fetch_optional(&pool_sqlite)
    .await?;
    let Some(mut task) = task else {
        return Ok(None);
    };
    sqlx::query("UPDATE sync_task SET status = ?1, updated_at = ?2 WHERE id = ?3 AND status = ?4")
        .bind(SYNC_STATUS_RUNNING)
        .bind(now_ms()?)
        .bind(task.id)
        .bind(SYNC_STATUS_PENDING)
        .execute(&pool_sqlite)
        .await?;
    task.status = SYNC_STATUS_RUNNING;
    Ok(Some(task))
}

/// 累计本任务消化的拉取批次与新增条数。
pub async fn record_batch(
    task_id: i64,
    batches_inc: i64,
    new_count_inc: i64,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(
        r#"UPDATE sync_task
           SET batches = batches + ?1, new_count = new_count + ?2, updated_at = ?3
           WHERE id = ?4"#,
    )
    .bind(batches_inc)
    .bind(new_count_inc)
    .bind(now_ms()?)
    .bind(task_id)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 任务成功: 置成功并清空 `last_error`。
pub async fn mark_success(task_id: i64) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query("UPDATE sync_task SET status = ?1, last_error = NULL, updated_at = ?2 WHERE id = ?3")
        .bind(SYNC_STATUS_SUCCESS)
        .bind(now_ms()?)
        .bind(task_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 任务失败: 置失败、`attempt+1`、记录原因。
pub async fn mark_failed(task_id: i64, err: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(
        r#"UPDATE sync_task
           SET status = ?1, attempt = attempt + 1, last_error = ?2, updated_at = ?3
           WHERE id = ?4"#,
    )
    .bind(SYNC_STATUS_FAILED)
    .bind(err)
    .bind(now_ms()?)
    .bind(task_id)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 应用启动复位: 执行中(进程死亡遗留)→ 待执行, 由 worker 从 `hist_floor` 续跑。
pub async fn reset_running() -> Result<u64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let res = sqlx::query("UPDATE sync_task SET status = ?1, updated_at = ?2 WHERE status = ?3")
        .bind(SYNC_STATUS_PENDING)
        .bind(now_ms()?)
        .bind(SYNC_STATUS_RUNNING)
        .execute(&pool_sqlite)
        .await?;
    Ok(res.rows_affected())
}

/// 批次保留: 仅清理「全终态且不在最新 `keep` 个批次内」的任务行。
///
/// pending/running 行永不清理(队列本体)。
pub async fn prune_batches(keep: i64) -> Result<u64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let res = sqlx::query(
        r#"DELETE FROM sync_task
           WHERE status IN (?1, ?2)
             AND batch_id NOT IN (
                 SELECT batch_id FROM sync_task GROUP BY batch_id ORDER BY batch_id DESC LIMIT ?3
             )"#,
    )
    .bind(SYNC_STATUS_SUCCESS)
    .bind(SYNC_STATUS_FAILED)
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
