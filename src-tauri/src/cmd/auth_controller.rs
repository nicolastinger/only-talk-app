use std::collections::HashMap;

use log::info;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;

use crate::cmd::api_controller::{post_request, ApiResponse};
use crate::dto::http_result::HttpResult;
use crate::entity::user_info::UserInfo;
use crate::entity::user_token::UserToken;
use crate::service::user_service::{add_user_map, get_user_info, user_login};
use crate::utils::global_static_str::DOMAIN_NAME;
use crate::{GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO, GLOBAL_SQL_POOL};

#[command]
pub async fn sign_in(
    url: String,
    mut body: HashMap<String, String>,
) -> Result<ApiResponse, String> {
    let client = Client::new();
    let response = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let response_body = response.text().await.map_err(|e| e.to_string())?;

    let sign_in_result: serde_json::Result<HttpResult> = serde_json::from_str(&response_body);
    let sign_in_result = match sign_in_result {
        Ok(t) => t,
        Err(_) => {
            return Err(response_body);
        }
    };

    if sign_in_result.code != 200 {
        return Err(response_body);
    }

    let parsed = Url::parse(&url).map_err(|x| x.to_string())?;
    let domain = parsed.domain().unwrap_or(DOMAIN_NAME).to_string();
    let port = parsed.port_or_known_default().unwrap_or(8443);
    let me_url = format!("https://{}:{}/user/me", &domain, &port);

    let data = sign_in_result.data.as_object().ok_or("sign_in data 不是 JSON 对象")?;
    let access_token = data.get("access_token").and_then(|v| v.as_str()).ok_or("缺少 access_token")?;
    let refresh_token = data.get("refresh_token").and_then(|v| v.as_str()).ok_or("缺少 refresh_token")?;
    info!("获取到的access_token: {}, refresh_token: {}", access_token, refresh_token);

    {
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("token".to_string(), access_token.to_string());
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("refresh_token".to_string(), refresh_token.to_string());
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("account".to_string(), body.remove("account").unwrap_or_default());
    }

    let me_res = post_request(me_url, String::new()).await?;
    let uuid = if me_res.status == 200 {
        let res: Value =
            serde_json::from_str(&me_res.body).map_err(|_| "解析用户信息失败".to_string())?;
        let data = res["data"].as_object().ok_or("me_res.body 不是 JSON 对象")?;
        let uuid = data["uuid"].as_str().ok_or("me_res.body 缺少 uuid 字段")?.to_string();
        add_user_map("uuid", &uuid).await.map_err(|e| e.to_string())?;
        Some(uuid)
    } else {
        None
    };

    user_login().await.map_err(|e| e.to_string())?;

    // 持久化 refresh_token 到 user_token 表
    if let Some(ref user_uuid) = uuid {
        let local_credit = local_ip_address::local_ip()
            .ok()
            .map(|ip| ip.to_string())
            .unwrap_or_default();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let user_token = UserToken {
            id: None,
            user_id: Some(user_uuid.clone()),
            refresh_token: Some(refresh_token.to_string()),
            local_credit: Some(local_credit),
            created_at: Some(now),
            updated_at: Some(now),
            version: Some(0),
        };
        if let Err(e) = UserToken::upsert(&user_token).await {
            info!("持久化 refresh_token 失败: {}", e);
        }
    }

    info!("登录成功");
    Ok(ApiResponse { status, body: response_body })
}

/// 通过 refresh_token 刷新 access_token
#[command]
pub async fn refresh_token_command(url: String) -> Result<ApiResponse, String> {
    let refresh_token = {
        GLOBAL_QUIC_USER_INFO
            .read()
            .await
            .get("refresh_token")
            .cloned()
            .ok_or("refresh_token 不存在，请重新登录")?
    };

    let refresh_url = format!("{}/refresh_token", url.trim_end_matches('/'));
    let body = serde_json::json!({ "refresh_token": refresh_token });

    let client = Client::new();
    let response = client.post(&refresh_url).json(&body).send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let response_body = response.text().await.map_err(|e| e.to_string())?;

    let refresh_result: serde_json::Result<HttpResult> = serde_json::from_str(&response_body);
    let refresh_result = match refresh_result {
        Ok(t) => t,
        Err(_) => {
            return Err(response_body);
        }
    };

    if refresh_result.code != 200 {
        return Err(response_body);
    }

    let data = refresh_result.data.as_object().ok_or("refresh_token data 不是 JSON 对象")?;
    let new_access_token = data.get("access_token").and_then(|v| v.as_str()).ok_or("缺少 access_token")?;

    {
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("token".to_string(), new_access_token.to_string());
    }

    info!("access_token 刷新成功");
    Ok(ApiResponse { status, body: response_body })
}

/// 登出命令
#[command]
pub async fn logout() -> Result<String, String> {
    // 清空用户信息
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.clear();
        info!("用户信息已清空")
    }

    // 清空全局服务器列表
    {
        let mut guard = GLOBAL_QUIC_SERVER_LIST.write().await;
        guard.clear();
        info!("服务器列表已清空")
    }

    // 清空数据库连接
    {
        let mut guard = GLOBAL_SQL_POOL.write().await;
        guard.take();
        info!("数据库连接已清空")
    }

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

#[command]
pub async fn delete_quick_login_user(user_id: String) -> Result<(), String> {
    UserToken::delete_by_user_id(&user_id).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
pub struct QuickLoginUser {
    pub user_id: String,
    pub username: Option<String>,
    pub account: Option<String>,
    pub icon: Option<String>,
    pub refresh_token: Option<String>,
    pub updated_at: Option<i64>,
}

#[command]
pub async fn get_quick_login_users() -> Result<Vec<QuickLoginUser>, String> {
    let tokens = UserToken::query_all_valid().await.map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let twenty_days_secs: i64 = 20 * 24 * 3600;

    let mut result = Vec::new();
    for token in tokens {
        let updated = token.updated_at.unwrap_or(0);
        if now - updated > twenty_days_secs {
            continue;
        }

        let user_info = UserInfo::query_by_uuid(token.user_id.as_deref().unwrap_or("")).await.ok().flatten();

        result.push(QuickLoginUser {
            user_id: token.user_id.unwrap_or_default(),
            username: user_info.as_ref().and_then(|u| u.username.clone()),
            account: user_info.as_ref().and_then(|u| u.account.clone()),
            icon: user_info.as_ref().and_then(|u| u.icon.clone()),
            refresh_token: token.refresh_token,
            updated_at: token.updated_at,
        });
    }

    Ok(result)
}

#[command]
pub async fn quick_login(refresh_token: String, url: String) -> Result<ApiResponse, String> {
    let refresh_url = format!("{}/user/refresh_token", url.trim_end_matches('/'));
    let body = serde_json::json!({ "refresh_token": refresh_token });

    let client = Client::new();
    let response = client.post(&refresh_url).json(&body).send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let response_body = response.text().await.map_err(|e| e.to_string())?;

    let refresh_result: serde_json::Result<HttpResult> = serde_json::from_str(&response_body);
    let refresh_result = match refresh_result {
        Ok(t) => t,
        Err(_) => {
            return Err(response_body);
        }
    };

    if refresh_result.code != 200 {
        return Err(response_body);
    }

    let data = refresh_result.data.as_object().ok_or("refresh_token data 不是 JSON 对象")?;
    let access_token = data.get("access_token").and_then(|v| v.as_str()).ok_or("缺少 access_token")?;
    let new_refresh_token = data.get("refresh_token").and_then(|v| v.as_str()).unwrap_or(&refresh_token);

    {
        GLOBAL_QUIC_USER_INFO.write().await.insert("token".to_string(), access_token.to_string());
        GLOBAL_QUIC_USER_INFO.write().await.insert("refresh_token".to_string(), new_refresh_token.to_string());
    }

    let parsed = Url::parse(&url).map_err(|x| x.to_string())?;
    let domain = parsed.domain().unwrap_or(DOMAIN_NAME).to_string();
    let port = parsed.port_or_known_default().unwrap_or(8443);
    let me_url = format!("https://{}:{}/user/me", &domain, &port);

    let me_res = post_request(me_url, String::new()).await?;
    let uuid = if me_res.status == 200 {
        let res: Value =
            serde_json::from_str(&me_res.body).map_err(|_| "解析用户信息失败".to_string())?;
        let me_data = res["data"].as_object().ok_or("me_res.body 不是 JSON 对象")?;
        let uuid = me_data["uuid"].as_str().ok_or("me_res.body 缺少 uuid 字段")?.to_string();
        add_user_map("uuid", &uuid).await.map_err(|e| e.to_string())?;
        Some(uuid)
    } else {
        None
    };

    user_login().await.map_err(|e| e.to_string())?;

    if let Some(ref user_uuid) = uuid {
        let local_credit = local_ip_address::local_ip()
            .ok()
            .map(|ip| ip.to_string())
            .unwrap_or_default();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let user_token = UserToken {
            id: None,
            user_id: Some(user_uuid.clone()),
            refresh_token: Some(new_refresh_token.to_string()),
            local_credit: Some(local_credit),
            created_at: Some(now),
            updated_at: Some(now),
            version: Some(0),
        };
        if let Err(e) = UserToken::upsert(&user_token).await {
            info!("持久化 refresh_token 失败: {}", e);
        }
    }

    info!("免登录成功");
    Ok(ApiResponse { status, body: response_body })
}
