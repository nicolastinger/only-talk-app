//! 应用日志(app_log)领域服务: 封装 app_log 表的分页查询与清空。

use crate::dao::app_log_db::{clear_app_logs as dao_clear_app_logs, query_app_logs_paged};
use crate::models::entity::app_log::AppLog;

/// 分页查询 app_log(支持按日志类型与等级过滤)。
pub async fn get_app_logs(
    log_type: Option<&str>,
    level: Option<i32>,
    page: i64,
    size: i64,
) -> Result<(Vec<AppLog>, i64), anyhow::Error> {
    query_app_logs_paged(log_type, level, page, size).await
}

/// 清空 app_log 全部日志，返回删除条数。
pub async fn clear_app_logs() -> Result<u64, anyhow::Error> {
    dao_clear_app_logs().await
}
