use log::info;
use reqwest::Client;
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;
use crate::GLOBAL_QUIC_USER_INFO;

#[derive(Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: String,
}

#[command]
pub async fn get_request(url: String) -> Result<ApiResponse, String> {
    let client = Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body })
}

#[command]
pub async fn post_request(url: String, body: String) -> Result<ApiResponse, String> {
    let client = Client::new();
    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    info!("token: {}", token);
    // 创建请求头
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse().map_err(|_| "token错误".to_string())?);

    // 解析body为JSON值，如果解析失败则将其作为字符串值处理
    let json_body: Value = serde_json::from_str(&body).unwrap_or(Value::String(body));

    let response = client
        .post(&url)
        .json(&json_body)
        .headers(headers)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let response_body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body: response_body })
}








