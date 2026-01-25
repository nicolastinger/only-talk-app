use log::{debug};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::GLOBAL_CONFIG;

/// 设置配置项
pub fn set_config(key: &str, value: &str) {
    GLOBAL_CONFIG.insert(key.to_string(), value.to_string());
    debug!("设置配置: {} = {}", key, value);
}

/// 获取配置项（字符串）
pub fn get_config(key: &str) -> Option<String> {
    GLOBAL_CONFIG.get(key).map(|v| v.value().clone())
}

/// 获取配置项（带默认值）
#[allow(dead_code)]
pub fn get_config_or_default(key: &str, default: &str) -> String {
    get_config(key).unwrap_or_else(|| {
        debug!("配置项 {} 不存在，使用默认值: {}", key, default);
        default.to_string()
    })
}

/// 删除配置项
#[allow(dead_code)]
pub fn remove_config(key: &str) {
    GLOBAL_CONFIG.remove(key);
    debug!("删除配置: {}", key);
}

/// 检查配置项是否存在
#[allow(dead_code)]
pub fn has_config(key: &str) -> bool {
    GLOBAL_CONFIG.contains_key(key)
}

/// 设置JSON格式的配置
#[allow(dead_code)]
pub fn set_config_json<T: Serialize>(key: &str, value: &T) -> Result<(), String> {
    match serde_json::to_string(value) {
        Ok(json_str) => {
            set_config(key, &json_str);
            Ok(())
        }
        Err(e) => Err(format!("序列化JSON失败: {}", e)),
    }
}

/// 获取JSON格式的配置
#[allow(dead_code)]
pub fn get_config_json<T: for<'de> Deserialize<'de>>(key: &str) -> Result<Option<T>, String> {
    if let Some(json_str) = get_config(key) {
        serde_json::from_str(&json_str).map(Some).map_err(|e| format!("反序列化JSON失败: {}", e))
    } else {
        Ok(None)
    }
}

/// 批量设置配置
#[allow(dead_code)]
pub fn set_config_batch(configs: &[(String, String)]) {
    for (key, value) in configs {
        set_config(key, value);
    }
}

/// 获取所有配置项
#[allow(dead_code)]
pub fn get_all_configs() -> Vec<(String, String)> {
    GLOBAL_CONFIG.iter().map(|entry| (entry.key().clone(), entry.value().clone())).collect()
}

/// 清空所有配置
#[allow(dead_code)]
pub fn clear_all_configs() {
    GLOBAL_CONFIG.clear();
    debug!("清空所有配置");
}

/// 获取配置项数量
#[allow(dead_code)]
pub fn config_count() -> usize {
    GLOBAL_CONFIG.len()
}

/// 检查并设置默认配置（仅当配置不存在时设置）
#[allow(dead_code)]
pub fn set_config_if_missing(key: &str, default_value: &str) {
    if !has_config(key) {
        set_config(key, default_value);
        debug!("设置默认配置: {} = {}", key, default_value);
    }
}

/// 更新配置（存在则更新，不存在则设置）
#[allow(dead_code)]
pub fn update_config(key: &str, value: &str) {
    set_config(key, value);
}

/// 导出配置为JSON字符串
#[allow(dead_code)]
pub fn export_config_to_json() -> String {
    let configs: std::collections::HashMap<String, String> =
        get_all_configs().into_iter().collect();
    serde_json::to_string_pretty(&configs).unwrap_or_else(|_| "{}".to_string())
}

/// 从JSON字符串导入配置
#[allow(dead_code)]
pub fn import_config_from_json(json_str: &str) -> Result<(), String> {
    let value: Value =
        serde_json::from_str(json_str).map_err(|e| format!("解析JSON失败: {}", e))?;

    if let Value::Object(obj) = value {
        for (key, val) in obj {
            if let Value::String(s) = val {
                set_config(&key, &s);
            } else {
                set_config(&key, &val.to_string());
            }
        }
        Ok(())
    } else {
        Err("JSON格式错误: 需要对象格式".to_string())
    }
}

/// 获取配置的数值类型（如果可以解析）
#[allow(dead_code)]
pub fn get_config_i64(key: &str) -> Option<i64> {
    get_config(key)?.parse().ok()
}

/// 获取配置的数值类型（带默认值）
#[allow(dead_code)]
pub fn get_config_i64_or_default(key: &str, default: i64) -> i64 {
    get_config_i64(key).unwrap_or(default)
}

/// 获取配置的布尔类型（如果可以解析）
#[allow(dead_code)]
pub fn get_config_bool(key: &str) -> Option<bool> {
    get_config(key)?.parse().ok()
}

/// 获取配置的布尔类型（带默认值）
#[allow(dead_code)]
pub fn get_config_bool_or_default(key: &str, default: bool) -> bool {
    get_config_bool(key).unwrap_or(default)
}
