use tauri::command;
use crate::{GLOBAL_QUIC_USER_INFO, GLOBAL_QUIC_SERVER_LIST, GLOBAL_READ_TASK_HANDLE};
use log::info;

/// 登出命令
#[command]
pub async fn logout() -> Result<String, String> {
    // 清空用户信息
    let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
    user_info.clear();
    drop(user_info); // 释放锁

    // 清空全局服务器列表
    {
        let mut guard = GLOBAL_QUIC_SERVER_LIST.write().await;
        guard.clear();
    }

    // 停止定时任务
    let mut task_handle = GLOBAL_READ_TASK_HANDLE.write().await;
    if let Some(handle) = task_handle.take() {
        handle.abort();
        info!("定时任务已停止");
    }
    drop(task_handle); // 释放锁
    
    info!("用户已登出");
    Ok("登出成功".to_string())
}

/// 清除用户信息命令
#[command]
pub async fn clear_user_info() -> Result<String, String> {
    info!("清除用户信息");
    
    // 清空全局用户信息
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.clear();
    }
    
    // 清空全局服务器列表
    {
        let mut guard = GLOBAL_QUIC_SERVER_LIST.write().await;
        guard.clear();
    }
    
    Ok("用户信息已清除".to_string())
}