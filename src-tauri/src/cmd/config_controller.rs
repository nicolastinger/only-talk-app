use serde::Serialize;
use tauri::command;

use crate::config::{get_config, persist_config, reset_config};

/// 客户端配置项(key-value)。
#[derive(Debug, Serialize)]
pub struct ClientConfigItem {
    pub key: String,
    pub value: String,
}

/// 读取单个配置项(内存, 启动时已从公共库 client_config 表加载)。
#[command]
pub fn get_client_config(key: String) -> Result<Option<String>, String> {
    Ok(get_config(&key))
}

/// 写入单个配置项: 公共库 client_config 表 + 内存, 立即生效(api_base/主题/语言)。
#[command]
pub async fn set_client_config(key: String, value: String) -> Result<(), String> {
    persist_config(&key, &value).await.map_err(|e| e.to_string())
}

/// 读取全部配置项(直接查公共库 client_config 表)。
#[command]
pub async fn get_all_client_config() -> Result<Vec<ClientConfigItem>, String> {
    let rows =
        crate::dao::client_config_db::get_all_configs().await.map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| match (row.config_key, row.config_value) {
            (Some(key), Some(value)) => Some(ClientConfigItem { key, value }),
            _ => None,
        })
        .collect())
}

/// 删除配置项并恢复为环境默认值(重新种子+加载内存)。
#[command]
pub async fn reset_client_config(key: String) -> Result<(), String> {
    reset_config(&key).await.map_err(|e| e.to_string())
}