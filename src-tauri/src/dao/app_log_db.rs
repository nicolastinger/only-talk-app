// 通用日志表 app_log 增删查改
//
// 建表语句（user.db）：
// CREATE TABLE IF NOT EXISTS app_log (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     log_type TEXT NOT NULL DEFAULT 'QUIC',
//     level INTEGER NOT NULL DEFAULT 1,
//     source TEXT NOT NULL DEFAULT '',
//     raw TEXT NOT NULL,
//     remote_addr TEXT NOT NULL DEFAULT '',
//     detail TEXT NOT NULL DEFAULT '',
//     created_at INTEGER NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_app_log_created_at ON app_log(created_at);
//
// 等级: 0=Debug 1=Info 2=Warn 3=Error

use crate::dao::get_db_client;
use crate::entity::app_log::AppLog;
use crate::utils::time::get_now_time_stamp_as_millis;

/// 插入一条日志，返回自增id
pub async fn insert_app_log(
    log_type: &str,
    level: i32,
    source: &str,
    raw: &str,
    remote_addr: &str,
    detail: &str,
) -> Result<i64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let created_at = get_now_time_stamp_as_millis().unwrap_or(0);
    let result = sqlx::query(
        r#"INSERT INTO app_log (log_type, level, source, raw, remote_addr, detail, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
    )
    .bind(log_type)
    .bind(level)
    .bind(source)
    .bind(raw)
    .bind(remote_addr)
    .bind(detail)
    .bind(created_at)
    .execute(&pool_sqlite)
    .await?;
    Ok(result.last_insert_rowid())
}

/// 便捷写入 QUIC 日志（log_type 固定为 QUIC）
pub async fn log_quic_event(
    level: i32,
    source: &str,
    raw: &str,
    remote_addr: &str,
) -> Result<i64, anyhow::Error> {
    insert_app_log("QUIC", level, source, raw, remote_addr, "").await
}

/// 分页查询日志，支持按日志类型与等级过滤，返回 (数据, 总数)
pub async fn query_app_logs_paged(
    log_type: Option<&str>,
    level: Option<i32>,
    page: i64,
    size: i64,
) -> Result<(Vec<AppLog>, i64), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let offset = (page - 1).max(0) * size;

    // 动态构建条件子句
    let mut conditions: Vec<String> = Vec::new();
    let mut bind_index = 1usize;
    let mut count_query = String::from("SELECT COUNT(*) FROM app_log");
    let mut list_query = String::from("SELECT * FROM app_log");
    if let Some(t) = log_type {
        conditions.push(format!("log_type = ?{}", bind_index));
        bind_index += 1;
    }
    if let Some(l) = level {
        conditions.push(format!("level = ?{}", bind_index));
        bind_index += 1;
    }
    if !conditions.is_empty() {
        let where_clause = format!(" WHERE {}", conditions.join(" AND "));
        count_query.push_str(&where_clause);
        list_query.push_str(&where_clause);
    }
    list_query.push_str(&format!(" ORDER BY id DESC LIMIT ?{} OFFSET ?{}", bind_index, bind_index + 1));

    let mut count_builder = sqlx::query_as::<_, (i64,)>(&count_query);
    let mut list_builder = sqlx::query_as::<_, AppLog>(&list_query);
    if let Some(t) = log_type {
        count_builder = count_builder.bind(t);
        list_builder = list_builder.bind(t);
    }
    if let Some(l) = level {
        count_builder = count_builder.bind(l);
        list_builder = list_builder.bind(l);
    }
    list_builder = list_builder.bind(size).bind(offset);

    let total: (i64,) = count_builder.fetch_one(&pool_sqlite).await?;
    let record = list_builder.fetch_all(&pool_sqlite).await?;
    Ok((record, total.0))
}

/// 根据id查询日志
pub async fn query_app_log_by_id(id: i64) -> Result<Option<AppLog>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, AppLog>(r#"SELECT * FROM app_log WHERE id = ?1"#)
        .bind(id)
        .fetch_optional(&pool_sqlite)
        .await?;
    Ok(record)
}

/// 更新日志（raw/detail）
pub async fn update_app_log(id: i64, raw: &str, detail: &str) -> Result<bool, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let result = sqlx::query(r#"UPDATE app_log SET raw = ?1, detail = ?2 WHERE id = ?3"#)
        .bind(raw)
        .bind(detail)
        .bind(id)
        .execute(&pool_sqlite)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// 根据id删除日志
pub async fn delete_app_log_by_id(id: i64) -> Result<bool, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let result = sqlx::query(r#"DELETE FROM app_log WHERE id = ?1"#)
        .bind(id)
        .execute(&pool_sqlite)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// 清空全部日志，返回删除条数
pub async fn clear_app_logs() -> Result<u64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let result = sqlx::query(r#"DELETE FROM app_log"#).execute(&pool_sqlite).await?;
    Ok(result.rows_affected())
}

/// 删除创建时间早于指定毫秒时间戳的日志（用于清理旧日志），返回删除条数
pub async fn delete_app_logs_before(timestamp: i64) -> Result<u64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let result = sqlx::query(r#"DELETE FROM app_log WHERE created_at < ?1"#)
        .bind(timestamp)
        .execute(&pool_sqlite)
        .await?;
    Ok(result.rows_affected())
}
