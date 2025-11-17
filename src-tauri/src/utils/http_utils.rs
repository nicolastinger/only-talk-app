use std::collections::HashMap;
use std::fmt::format;
use anyhow::anyhow;
use log::{error, info};
use reqwest::{Client, Response, Url};
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::{entity::user::SignInResult, GLOBAL_QUIC_USER_INFO};
use crate::service::user_service::user_login;
use crate::quic_service::text_quic_client::run_client;
use crate::utils::global_static_str::QUIC_SERVER_ADDR;

#[derive(Serialize, Deserialize)]
pub struct ApiResponse {
   pub status: u16,
   pub body: String,
}

#[tauri::command]
pub async fn get_request(url: String) -> Result<ApiResponse, String> {
    let client = Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body })
}

#[tauri::command]
pub async fn post_request(url: String, body: String) -> Result<ApiResponse, String> {
    let client = Client::new();
    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or_else(|| &empty_token).clone();
    // 创建请求头
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse().map_err(|_| "token错误".to_string())?);

    // 解析body为JSON值，如果解析失败则将其作为字符串值处理
    let json_body: Value = serde_json::from_str(&body).unwrap_or(Value::String(body));
    
    let response = client.post(&url).json(&json_body).headers(headers).send().await.map_err(|e| e.to_string())?;
    

    let status = response.status().as_u16();
    let response_body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body: response_body })
}

pub async fn post(url: String, body: HashMap<String, String>) -> Result<Response, anyhow::Error> {
    let client = Client::new();
    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or_else(|| &empty_token).clone();
    // 创建请求头
    let mut headers = HeaderMap::new();
    info!("token为 {}", token);
    headers.insert("Authorization", token.parse()?);

    let response = client.post(&url).json(&body).headers(headers).send().await?;
    Ok(response)
}

#[tauri::command]
pub async fn sign_in(url: String, mut body: HashMap<String, String>) -> Result<ApiResponse, String> {
    let client = Client::new();
    let response = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let response_body = response.text().await.map_err(|e| e.to_string())?;
    info!("response_body: {:?}", response_body);
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
    let domain = parsed.domain().unwrap_or("onlytalk.local").to_string();
    let port = parsed.port_or_known_default().unwrap_or(8443);
    let me_url = format!("https://{}:{}/user/me", &domain, &port);

    {
        GLOBAL_QUIC_USER_INFO.write().await.insert("token".to_string(), sign_in_result.data);
        GLOBAL_QUIC_USER_INFO.write().await.insert("account".to_string(), body.remove("account").unwrap_or(String::new()));
    }
    info!("me_url: {:?}", me_url);
    let me_res = post_request(me_url, String::new()).await?;
    if me_res.status == 200 {
        let res: Value = serde_json::from_str(&me_res.body).map_err(|x| "解析用户信息失败".to_string())?;
        let data = res["data"].as_object().ok_or("me_res.body 不是 JSON 对象")?;
        let uuid = data["uuid"].as_str().ok_or("me_res.body 缺少 uuid 字段")?.to_string();
        GLOBAL_QUIC_USER_INFO.write().await.insert("uuid".to_string(), uuid);
    }

    user_login().await.map_err(|e| e.to_string())?;
    Ok(ApiResponse { status, body: response_body })
}