use tauri::{AppHandle, Runtime};

use crate::service::update_service;
use crate::vo::update_vo::UpdateInfo;

/// 查询 GitHub Releases 最新版本(含当前平台的安装包资产)。
/// 无新发布或当前平台无匹配资产时返回 None, 网络失败返回 Err。
#[tauri::command]
pub async fn get_latest_release() -> Result<Option<UpdateInfo>, String> {
    update_service::get_latest_release().await.map_err(|e| {
        log::error!("检查更新失败: {}", e);
        e.to_string()
    })
}

/// 下载更新包到本地并校验 SHA-256, 返回本地绝对路径。
#[tauri::command]
pub async fn download_update_package<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    file_name: String,
    sha256: Option<String>,
) -> Result<String, String> {
    update_service::download_update_package(app, url, file_name, sha256).await.map_err(|e| {
        log::error!("下载更新包失败: {}", e);
        e.to_string()
    })
}

/// 安装更新包:
/// - Windows: 静默运行 NSIS 安装器并退出本进程
/// - Android: 调起系统安装器(用户确认安装)
#[tauri::command]
pub async fn install_update<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    update_service::install_update(app, path).await
}
