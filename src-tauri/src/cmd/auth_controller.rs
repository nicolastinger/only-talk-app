use std::collections::HashMap;

use log::info;
use reqwest::header::HeaderMap;
use reqwest::{Client, Response, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;

use crate::cmd::api_controller::{post_request, ApiResponse};
use crate::entity::user::SignInResult;
use crate::service::user_service::{add_user_map, user_login};
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

    let sign_in_result: serde_json::Result<SignInResult> = serde_json::from_str(&response_body);
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

    {
        GLOBAL_QUIC_USER_INFO.write().await.insert("token".to_string(), sign_in_result.data);
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("account".to_string(), body.remove("account").unwrap_or_default());
    }

    let me_res = post_request(me_url, String::new()).await?;
    if me_res.status == 200 {
        let res: Value =
            serde_json::from_str(&me_res.body).map_err(|_| "解析用户信息失败".to_string())?;
        let data = res["data"].as_object().ok_or("me_res.body 不是 JSON 对象")?;
        let uuid = data["uuid"].as_str().ok_or("me_res.body 缺少 uuid 字段")?.to_string();
        add_user_map("uuid", &uuid).await.map_err(|e| e.to_string())?;
    }

    user_login().await.map_err(|e| e.to_string())?;
    info!("登录成功");
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
