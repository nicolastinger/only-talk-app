use std::collections::HashMap;
use reqwest::{Client, Response};
use reqwest::header::HeaderMap;
use crate::GLOBAL_QUIC_USER_INFO;

pub async fn post_with_body(url: String, body: HashMap<String, String>) -> Result<Response, anyhow::Error> {
    let client = Client::builder().timeout(std::time::Duration::from_secs(30)).build()?;

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    // 创建请求头
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse()?);

    let response = client.post(&url).json(&body).headers(headers).send().await?;
    Ok(response)
}

pub async fn get_with_token(url: String) -> Result<Response, anyhow::Error> {
    let client = Client::builder().timeout(std::time::Duration::from_secs(30)).build()?;

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    // 创建请求头
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse()?);

    let response = client.get(&url).headers(headers).send().await?;
    Ok(response)
}