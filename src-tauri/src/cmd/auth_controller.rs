use std::collections::HashMap;

use tauri::command;

pub use crate::service::api_service::ApiResponse;
use crate::service::auth_service;
pub use crate::service::auth_service::QuickLoginUser;

/// 账号密码登录。
#[command]
pub async fn sign_in(url: String, body: HashMap<String, String>) -> Result<ApiResponse, String> {
    auth_service::sign_in(url, body).await
}

/// GitHub OAuth 登录（免密）。
#[command]
pub async fn github_login(url: String, app: tauri::AppHandle) -> Result<ApiResponse, String> {
    auth_service::github_login(url, app).await
}

/// 通过 refresh_token 刷新 access_token。
#[command]
pub async fn refresh_token_command(url: String) -> Result<ApiResponse, String> {
    auth_service::refresh_token(url).await
}

/// 登出命令: 统一清理当前会话(QUIC/定时任务/媒体/数据库连接/全局状态)。
#[command]
pub async fn logout() -> Result<String, String> {
    auth_service::logout().await
}

/// 清除用户信息命令(复用统一会话清理, 幂等, 与 logout 重复调用无副作用)。
#[command]
pub async fn clear_user_info() -> Result<String, String> {
    auth_service::clear_user_info().await
}

/// 删除本地保存的快速登录用户。
#[command]
pub async fn delete_quick_login_user(user_id: String) -> Result<(), String> {
    auth_service::delete_quick_login_user(user_id).await
}

/// 列出可快速登录的用户。
#[command]
pub async fn get_quick_login_users() -> Result<Vec<QuickLoginUser>, String> {
    auth_service::get_quick_login_users().await
}

/// 免密快速登录。
#[command]
pub async fn quick_login(refresh_token: String, url: String) -> Result<ApiResponse, String> {
    auth_service::quick_login(refresh_token, url).await
}
