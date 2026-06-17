use std::collections::HashMap;

use crate::dto::http_result::HttpResult;
use crate::dto::update_user_dto::UpdateUserDTO;
use crate::entity::user_info::UserInfo;
use crate::quic_service::connection_state::GLOBAL_QUIC_STATE;
use crate::service::api_service::{get_with_token, post_json};
use crate::service::user_service::{disconnect_quic, reconnect_quic};
use crate::utils::global_static_str::TALK_API;
use crate::GLOBAL_QUIC_USER_INFO;
use log::{info, warn};
use serde::{Deserialize, Serialize};

/// 用户信息响应（包含缓存状态）
#[derive(Debug, Serialize, Deserialize)]
pub struct UserInfoWithCache {
    /// 用户信息
    pub user_info: UserInfo,
    /// 是否来自缓存
    pub from_cache: bool,
}

/// 增加持久化数据
#[tauri::command]
pub async fn add_user_map(map: HashMap<String, String>) -> Result<String, String> {
    GLOBAL_QUIC_USER_INFO.write().await.extend(map.into_iter());
    Ok("success".to_string())
}

/// 获取持久化数据
#[tauri::command]
pub async fn get_user_map(key: String) -> Result<String, String> {
    Ok(GLOBAL_QUIC_USER_INFO.read().await.get(&key).cloned().ok_or("not found")?.to_string())
}

/// 断开QUIC连接
/// 清理所有与服务器连接的QUIC资源
#[tauri::command]
pub async fn disconnect_quic_command() -> Result<String, String> {
    disconnect_quic().await.map_err(|e| e.to_string())?;
    Ok("QUIC连接已断开".to_string())
}

/// 重新连接QUIC服务
/// 重新建立与服务器连接的QUIC资源
#[tauri::command]
pub async fn reconnect_quic_command() -> Result<String, String> {
    reconnect_quic().await.map_err(|e| e.to_string())?;
    Ok("QUIC重连请求已发送".to_string())
}

/// 获取当前 QUIC 连接状态
#[tauri::command]
pub async fn get_quic_connection_state() -> Result<String, String> {
    let state = *GLOBAL_QUIC_STATE.read().await;
    Ok(state.as_str().to_string())
}

/// 缓存用户信息到本地数据库
#[tauri::command]
pub async fn cache_user_info(user_info: UserInfo) -> Result<(), String> {
    user_info.upsert().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 根据UUID获取缓存的用户信息
#[tauri::command]
pub async fn get_cached_user_info(uuid: String) -> Result<Option<UserInfo>, String> {
    UserInfo::query_by_uuid(&uuid).await.map_err(|e| e.to_string())
}

/// 根据账号获取缓存的用户信息
#[tauri::command]
pub async fn get_cached_user_info_by_account(account: String) -> Result<Option<UserInfo>, String> {
    UserInfo::query_by_account(&account).await.map_err(|e| e.to_string())
}

/// 根据UUID获取用户信息（优先本地缓存，然后远程获取）
/// 返回用户信息和是否来自缓存的标志
#[tauri::command]
pub async fn get_user_info_with_cache(uuid: String) -> Result<UserInfoWithCache, String> {
    let cached_user = UserInfo::query_by_uuid(&uuid).await.map_err(|e| e.to_string())?;

    if let Some(user_info) = cached_user {
        info!("从本地缓存获取用户信息: uuid={}", uuid);
        return Ok(UserInfoWithCache { user_info, from_cache: true });
    }

    info!("本地缓存未命中，从远程获取用户信息: uuid={}", uuid);
    let url = format!("{}/user/get_user_by_uuid/{}", TALK_API, uuid);

    let response = get_with_token(url).await.map_err(|e| {
        warn!("远程获取用户信息失败: uuid={}, error={}", uuid, e);
        e.to_string()
    })?;

    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("HTTP错误: {}", status));
    }

    let http_result: HttpResult = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    if http_result.code != 200 {
        return Err(http_result.message);
    }

    let remote_user: UserInfo =
        serde_json::from_value(http_result.data).map_err(|e| e.to_string())?;

    if let Err(e) = remote_user.upsert().await {
        warn!("缓存用户信息失败: uuid={}, error={}", uuid, e);
    } else {
        info!("用户信息已缓存: uuid={}", uuid);
    }

    Ok(UserInfoWithCache { user_info: remote_user, from_cache: false })
}

/// 根据UUID刷新用户信息（强制从远程获取并更新缓存）
#[tauri::command]
pub async fn refresh_user_info(uuid: String) -> Result<UserInfo, String> {
    info!("强制刷新用户信息: uuid={}", uuid);
    let url = format!("{}/user/get_user_by_uuid/{}", TALK_API, uuid);

    let response = get_with_token(url).await.map_err(|e| e.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("HTTP错误: {}", status));
    }

    let http_result: HttpResult = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    if http_result.code != 200 {
        return Err(http_result.message);
    }

    let remote_user: UserInfo =
        serde_json::from_value(http_result.data).map_err(|e| e.to_string())?;

    remote_user.upsert().await.map_err(|e| e.to_string())?;
    info!("用户信息已刷新并缓存: uuid={}", uuid);

    Ok(remote_user)
}

/// 更新用户信息
#[tauri::command]
pub async fn update_user_info_command(update_dto: UpdateUserDTO) -> Result<String, String> {
    let url = format!("{}/user/update", TALK_API);

    let response = post_json(url, &update_dto).await.map_err(|e| e.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if status.is_success() {
        let http_result: HttpResult = serde_json::from_str(&body).map_err(|e| e.to_string())?;
        if http_result.code == 200 {
            if let Some(uuid) = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").cloned() {
                if let Ok(Some(mut cached_user)) = UserInfo::query_by_uuid(&uuid).await {
                    if let Some(ref username) = update_dto.username {
                        cached_user.username = Some(username.clone());
                    }
                    if let Some(ref info) = update_dto.info {
                        cached_user.info = Some(info.clone());
                    }
                    if update_dto.gender.is_some() {
                        cached_user.gender = update_dto.gender;
                    }
                    if update_dto.age.is_some() {
                        cached_user.age = update_dto.age;
                    }
                    if update_dto.birthday.is_some() {
                        cached_user.birthday = update_dto.birthday;
                    }
                    if let Some(ref phone) = update_dto.phone {
                        cached_user.phone = Some(phone.clone());
                    }
                    if let Some(ref email) = update_dto.email {
                        cached_user.email = Some(email.clone());
                    }
                    if let Some(ref address) = update_dto.address {
                        cached_user.address = Some(address.clone());
                    }
                    let _ = cached_user.update_by_uuid().await;
                }
            }
            Ok(body)
        } else {
            Err(http_result.message)
        }
    } else {
        Err(format!("HTTP错误: {}", status))
    }
}
