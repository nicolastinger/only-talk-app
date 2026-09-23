use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use crate::dao::app_log_db::{clear_app_logs as dao_clear_app_logs, query_app_logs_paged};
use crate::entity::app_log::AppLog;
use crate::utils::global_static_str::{LOG_FILE_NAME, LOG_PATH};

/// 分页返回的日志数据
#[derive(serde::Serialize)]
pub struct LogPage {
    pub total: i64,
    pub list: Vec<AppLog>,
}

/// 客户端日志文件信息(fast_log 每日滚动产物)
#[derive(serde::Serialize)]
pub struct LogFileInfo {
    pub name: String,
    pub size: i64,
    pub modified_at: i64,
}

/// 客户端日志文件内容(读取尾部若干行)
#[derive(serde::Serialize)]
pub struct LogFileContent {
    pub name: String,
    pub total_lines: i64,
    pub lines: Vec<String>,
}

/// 分页查询 app_log（支持按日志类型与等级过滤），供开发者面板「系统日志」使用。
/// page/size 默认 1/50。
#[tauri::command]
pub async fn get_app_logs(
    log_type: Option<String>,
    level: Option<i32>,
    page: Option<i64>,
    size: Option<i64>,
) -> Result<LogPage, String> {
    let page = page.unwrap_or(1).max(1);
    let size = size.unwrap_or(50).clamp(1, 500);
    let (list, total) = query_app_logs_paged(log_type.as_deref(), level, page, size)
        .await
        .map_err(|e| e.to_string())?;
    Ok(LogPage { total, list })
}

/// 清空 app_log 全部日志，返回删除条数。
#[tauri::command]
pub async fn clear_app_logs() -> Result<i64, String> {
    dao_clear_app_logs().await.map_err(|e| e.to_string()).map(|n| n as i64)
}

/// 客户端日志目录(fast_log 输出目录, init_app 时写入配置)
fn log_dir() -> Result<PathBuf, String> {
    let dir = crate::config::get_config(LOG_PATH).ok_or_else(|| "日志目录未初始化".to_string())?;
    Ok(PathBuf::from(dir))
}

/// 列出客户端日志文件(fast_log 的 .log 文件, 按修改时间倒序)。
#[tauri::command]
pub async fn get_client_log_files() -> Result<Vec<LogFileInfo>, String> {
    let dir = log_dir()?;
    let mut files: Vec<LogFileInfo> = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "log" {
            continue;
        }
        let meta = path.metadata().map_err(|e| e.to_string())?;
        let modified_at = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        files.push(LogFileInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            size: meta.len() as i64,
            modified_at,
        });
    }
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(files)
}

/// 读取客户端日志文件尾部若干行。file_name 为空时默认读当前日志文件(only_talk.log)。
/// max_lines 默认 300, 上限 5000。
#[tauri::command]
pub async fn read_client_log_file(
    file_name: Option<String>,
    max_lines: Option<i64>,
) -> Result<LogFileContent, String> {
    let dir = log_dir()?;
    let name = file_name
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| LOG_FILE_NAME.to_string());
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("非法文件名".to_string());
    }
    let path = dir.join(&name);
    if !path.is_file() {
        return Err(format!("日志文件不存在: {}", name));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let all_lines: Vec<&str> = content.lines().collect();
    let total_lines = all_lines.len() as i64;
    let max = (max_lines.unwrap_or(300)).clamp(1, 5000) as usize;
    let start = all_lines.len().saturating_sub(max);
    let lines: Vec<String> = all_lines[start..].iter().map(|s| s.to_string()).collect();
    Ok(LogFileContent { name, total_lines, lines })
}