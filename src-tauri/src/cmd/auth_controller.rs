use std::collections::HashMap;

use log::info;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;

use crate::cmd::api_controller::{post_request, ApiResponse};
use crate::dto::http_result::HttpResult;
use crate::entity::user_info::UserInfo;
use crate::entity::user_token::UserToken;
use crate::service::p2p_service;
use crate::service::user_service::{add_user_map, teardown_session, user_login};
use crate::utils::global_static_str::talk_api_domain;
use crate::utils::http_client::http_client;
use crate::GLOBAL_QUIC_USER_INFO;

#[command]
pub async fn sign_in(
    url: String,
    mut body: HashMap<String, String>,
) -> Result<ApiResponse, String> {
    body.insert("device_fingerprint".to_string(), crate::utils::device_info::device_fingerprint());
    let client = http_client();
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

    let account = body.remove("account").unwrap_or_default();
    finish_login(&url, status, &response_body, account).await
}

/// 登录收尾（账号密码 / GitHub OAuth 共用）：
/// 写全局用户信息 → 拉 /user/me 取 uuid → 启动登录会话 → 持久化 refresh_token
async fn finish_login(
    url: &str,
    status: u16,
    response_body: &str,
    account: String,
) -> Result<ApiResponse, String> {
    let parsed = Url::parse(url).map_err(|x| x.to_string())?;
    let scheme = parsed.scheme().to_string();
    let host = parsed.host_str().map(|h| h.to_string()).unwrap_or_else(talk_api_domain);
    let me_url = match parsed.port() {
        Some(p) => format!("{}://{}:{}/user/me", scheme, host, p),
        None => format!("{}://{}/user/me", scheme, host),
    };

    let sign_in_result: HttpResult =
        serde_json::from_str(response_body).map_err(|e| e.to_string())?;
    let data = sign_in_result.data.as_object().ok_or("sign_in data 不是 JSON 对象")?;
    let access_token =
        data.get("access_token").and_then(|v| v.as_str()).ok_or("缺少 access_token")?;
    let refresh_token =
        data.get("refresh_token").and_then(|v| v.as_str()).ok_or("缺少 refresh_token")?;

    {
        GLOBAL_QUIC_USER_INFO.write().await.insert("token".to_string(), access_token.to_string());
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("refresh_token".to_string(), refresh_token.to_string());
        GLOBAL_QUIC_USER_INFO.write().await.insert("account".to_string(), account);
    }

    let me_res = post_request(me_url, String::new()).await?;
    let uuid = if me_res.status == 200 {
        let res: Value =
            serde_json::from_str(&me_res.body).map_err(|_| "解析用户信息失败".to_string())?;
        let data = res["data"].as_object().ok_or("me_res.body 不是 JSON 对象")?;
        let uuid = data["uuid"].as_str().ok_or("me_res.body 缺少 uuid 字段")?.to_string();
        add_user_map("uuid", &uuid).await.map_err(|e| e.to_string())?;
        // GitHub 等场景以服务端 account 为准
        if let Some(acc) = data.get("account").and_then(|v| v.as_str()) {
            GLOBAL_QUIC_USER_INFO.write().await.insert("account".to_string(), acc.to_string());
        }
        Some(uuid)
    } else {
        None
    };

    user_login().await.map_err(|e| e.to_string())?;

    // 登录成功后延迟检测 IPv6 支持(需从 API 动态获取 NAT UDP 端口)
    tauri::async_runtime::spawn(p2p_service::check_ipv6_support());

    // 持久化 refresh_token 到 user_token 表
    if let Some(ref user_uuid) = uuid {
        let local_credit = crate::utils::device_info::device_fingerprint();
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
    Ok(ApiResponse { status, body: response_body.to_string() })
}

/// GitHub OAuth 登录（免密）：
/// 后端取授权地址 → 系统浏览器授权 → 本机回环 127.0.0.1:9527 收 code → 后端换 token → 收尾登录
#[command]
pub async fn github_login(url: String, app: tauri::AppHandle) -> Result<ApiResponse, String> {
    use tauri_plugin_opener::OpenerExt;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let base = url.trim_end_matches('/');
    let device_fp = crate::utils::device_info::device_fingerprint();

    // 1. 后端生成 state + 授权地址
    let authorize_endpoint = format!("{}/user/github/authorize_url", base);
    let authorize_body = serde_json::json!({
        "platform": "PC",
        "device_fingerprint": device_fp,
    });
    let client = http_client();
    let resp = client
        .post(&authorize_endpoint)
        .json(&authorize_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp_body = resp.text().await.map_err(|e| e.to_string())?;
    let result: HttpResult = serde_json::from_str(&resp_body).map_err(|_| resp_body.clone())?;
    if result.code != 200 {
        return Err(resp_body);
    }
    let authorize_url = result
        .data
        .get("authorize_url")
        .and_then(|v| v.as_str())
        .ok_or("缺少 authorize_url")?
        .to_string();
    let state = result.data.get("state").and_then(|v| v.as_str()).ok_or("缺少 state")?.to_string();

    // 2. 启动本机回环监听（GitHub OAuth App 回调地址须与配置一致）
    let listener = TcpListener::bind("127.0.0.1:9527")
        .await
        .map_err(|e| format!("启动 GitHub 回调监听失败: {}", e))?;

    // 3. 系统浏览器打开授权页
    app.opener()
        .open_url(&authorize_url, None::<&str>)
        .map_err(|e| format!("打开 GitHub 授权页失败: {}", e))?;

    // 4. 等待回调（5 分钟超时）
    let (code, state_back, oauth_error) = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        async {
            let (mut socket, _) = listener.accept().await.map_err(|e| e.to_string())?;
                let mut buf = [0u8; 4096];
                let n = socket.read(&mut buf).await.map_err(|e| e.to_string())?;
                let req_text = String::from_utf8_lossy(&buf[..n]).to_string();
                let path = req_text.split_whitespace().nth(1).unwrap_or("/").to_string();

                let params: std::collections::HashMap<String, String> = url::Url::parse(
                    &format!("http://127.0.0.1:9527{}", path),
                )
                .map_err(|e| format!("解析回调地址失败: {}", e))?
                .query_pairs()
                .into_owned()
                .collect();

                let html = if params.get("error").is_some() {
                    "<h2>GitHub 授权失败, 请关闭此页面重试</h2>"
                } else {
                    "<h2>OnlyTalk 登录成功, 可关闭此页面</h2>"
                };
                let http_resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = socket.write_all(http_resp.as_bytes()).await;

                Ok::<(Option<String>, Option<String>, Option<String>), String>((
                    params.get("code").cloned(),
                    params.get("state").cloned(),
                    params.get("error").cloned(),
                ))
        },
    )
    .await
    .map_err(|_| "等待 GitHub 授权超时".to_string())?
    .map_err(|e| e)?;

    if oauth_error.is_some() {
        return Err(format!("GitHub 授权失败: {}", oauth_error.unwrap_or_default()));
    }
    if state_back.as_deref() != Some(state.as_str()) {
        return Err("GitHub 授权 state 校验失败".to_string());
    }
    let code = code.ok_or("GitHub 授权回调缺少 code")?;

    // 5. 后端换 token（免密，首次自动注册）
    let callback_endpoint = format!("{}/user/github/callback", base);
    let cb_body = serde_json::json!({
        "code": code,
        "state": state,
        "platform": "PC",
        "device_fingerprint": device_fp,
    });
    let resp =
        client.post(&callback_endpoint).json(&cb_body).send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let response_body = resp.text().await.map_err(|e| e.to_string())?;
    let cb_result: HttpResult =
        serde_json::from_str(&response_body).map_err(|_| response_body.clone())?;
    if cb_result.code != 200 {
        return Err(response_body);
    }

    finish_login(&url, status, &response_body, "github".to_string()).await
}

/// 通过 refresh_token 刷新 access_token
#[command]
#[allow(clippy::disallowed_methods)]
pub async fn refresh_token_command(url: String) -> Result<ApiResponse, String> {
    let refresh_token = {
        GLOBAL_QUIC_USER_INFO
            .read()
            .await
            .get("refresh_token")
            .cloned()
            .ok_or("refresh_token 不存在，请重新登录")?
    };

    let refresh_url = format!("{}/user/refresh_token", url.trim_end_matches('/'));
    let body = serde_json::json!({
        "refresh_token": refresh_token,
        "device_fingerprint": crate::utils::device_info::device_fingerprint()
    });

    let client = http_client();
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
    let new_access_token =
        data.get("access_token").and_then(|v| v.as_str()).ok_or("缺少 access_token")?;

    {
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("token".to_string(), new_access_token.to_string());
    }

    info!("access_token 刷新成功");
    Ok(ApiResponse { status, body: response_body })
}

/// 登出命令: 统一清理当前会话(QUIC/定时任务/媒体/数据库连接/全局状态)
#[command]
pub async fn logout() -> Result<String, String> {
    teardown_session().await.map_err(|e| e.to_string())?;
    info!("用户已登出");
    Ok("登出成功".to_string())
}

/// 清除用户信息命令(复用统一会话清理, 幂等, 与 logout 重复调用无副作用)
#[command]
pub async fn clear_user_info() -> Result<String, String> {
    info!("清除用户信息");
    teardown_session().await.map_err(|e| e.to_string())?;
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
    // 与后端 refresh_token 有效期保持一致 (30 天, 见 only-talk-rs user_service 3600*24*30)
    let thirty_days_secs: i64 = 30 * 24 * 3600;

    let mut result = Vec::new();
    for token in tokens {
        let updated = token.updated_at.unwrap_or(0);
        if now - updated > thirty_days_secs {
            continue;
        }

        let user_info =
            UserInfo::query_by_uuid(token.user_id.as_deref().unwrap_or("")).await.ok().flatten();

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
#[allow(clippy::disallowed_methods)]
pub async fn quick_login(refresh_token: String, url: String) -> Result<ApiResponse, String> {
    let refresh_url = format!("{}/user/refresh_token", url.trim_end_matches('/'));
    let body = serde_json::json!({
        "refresh_token": refresh_token,
        "device_fingerprint": crate::utils::device_info::device_fingerprint()
    });

    let client = http_client();
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
    let access_token =
        data.get("access_token").and_then(|v| v.as_str()).ok_or("缺少 access_token")?;
    let new_refresh_token =
        data.get("refresh_token").and_then(|v| v.as_str()).unwrap_or(&refresh_token);

    {
        GLOBAL_QUIC_USER_INFO.write().await.insert("token".to_string(), access_token.to_string());
        GLOBAL_QUIC_USER_INFO
            .write()
            .await
            .insert("refresh_token".to_string(), new_refresh_token.to_string());
    }

    let parsed = Url::parse(&url).map_err(|x| x.to_string())?;
    let scheme = parsed.scheme().to_string();
    let host = parsed.host_str().map(|h| h.to_string()).unwrap_or_else(talk_api_domain);
    let me_url = match parsed.port() {
        Some(p) => format!("{}://{}:{}/user/me", scheme, host, p),
        None => format!("{}://{}/user/me", scheme, host),
    };

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
        let local_credit = crate::utils::device_info::device_fingerprint();
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
