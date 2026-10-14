//! 全局用户信息(`GLOBAL_QUIC_USER_INFO`)的中立访问器。
//!
//! 这些访问器原先散落在 controller / service 层, 导致底层 dao 反向依赖上层。
//! 集中到此处后各层均可向下依赖, 消除 `dao -> cmd` / `dao -> service` 的依赖倒置。

use anyhow::anyhow;

use crate::GLOBAL_QUIC_USER_INFO;

/// 读取指定 key 的用户信息, 不存在返回错误。
pub async fn get_user_info(key: &str) -> Result<String, anyhow::Error> {
    let guard = GLOBAL_QUIC_USER_INFO.read().await;
    guard.get(key).cloned().ok_or_else(|| anyhow!("数据不存在"))
}

/// 写入指定 key 的用户信息。
pub async fn insert_user_info(key: &str, value: &str) -> Result<(), anyhow::Error> {
    GLOBAL_QUIC_USER_INFO.write().await.insert(key.to_string(), value.to_string());
    Ok(())
}

/// 读取指定 key 的用户信息, 不存在返回字符串错误(兼容旧调用)。
pub async fn get_user_map(key: &str) -> Result<String, String> {
    GLOBAL_QUIC_USER_INFO.read().await.get(key).cloned().ok_or_else(|| "not found".to_string())
}

/// 写入指定 key 的用户信息, 返回字符串错误(兼容旧调用)。
pub async fn add_user_map(key: &str, value: &str) -> Result<(), String> {
    GLOBAL_QUIC_USER_INFO.write().await.insert(key.to_string(), value.to_string());
    Ok(())
}

/// 批量合并用户信息(command `add_user_map` 使用)。
pub async fn extend_user_map(map: std::collections::HashMap<String, String>) {
    GLOBAL_QUIC_USER_INFO.write().await.extend(map);
}

/// 删除指定 key 的用户信息(command `remove_user_map` 使用)。
pub async fn remove_user_map(key: &str) {
    GLOBAL_QUIC_USER_INFO.write().await.remove(key);
}
