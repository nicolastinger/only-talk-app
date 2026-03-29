use std::collections::HashMap;
use std::path::PathBuf;

use log::info;
use reqwest::header::HeaderMap;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;

use crate::service::api_service::{
    post_form_data, upload_file, upload_file_with_fields, upload_multiple_files,
    upload_multiple_files_with_fields,
};
use crate::utils::image_utils::compress_image_to_webp;
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
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse().map_err(|_| "token错误".to_string())?);

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

#[command]
pub async fn upload_file_request(
    url: String,
    file_path: String,
    field_name: String,
) -> Result<ApiResponse, String> {
    let response = upload_file(&url, &file_path, &field_name).await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body })
}

#[command]
pub async fn upload_file_with_extra_fields_request(
    url: String,
    file_path: String,
    field_name: String,
    extra_fields: HashMap<String, String>,
) -> Result<ApiResponse, String> {
    let extra_vec: Vec<(String, String)> = extra_fields.into_iter().collect();

    let response = upload_file_with_fields(&url, &file_path, &field_name, extra_vec)
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body })
}

#[command]
pub async fn upload_multiple_files_request(
    url: String,
    file_paths: Vec<String>,
    field_name: String,
) -> Result<ApiResponse, String> {
    let response =
        upload_multiple_files(&url, &file_paths, &field_name).await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body })
}

#[command]
pub async fn upload_multiple_files_with_extra_fields_request(
    url: String,
    file_paths: Vec<String>,
    field_name: String,
    extra_fields: HashMap<String, String>,
) -> Result<ApiResponse, String> {
    let extra_vec: Vec<(String, String)> = extra_fields.into_iter().collect();

    let response = upload_multiple_files_with_fields(&url, &file_paths, &field_name, extra_vec)
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body })
}

#[command]
pub async fn post_form_data_request(
    url: String,
    fields: HashMap<String, String>,
) -> Result<ApiResponse, String> {
    let response = post_form_data(&url, fields).await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, body })
}

#[command]
pub async fn compress_image_to_webp_command(input_path: String) -> Result<String, String> {
    let input = PathBuf::from(&input_path);

    let result = tokio::task::spawn_blocking(move || compress_image_to_webp(&input))
        .await
        .map_err(|e| e.to_string())?;

    let output_path = result.map_err(|e| e.to_string())?;
    Ok(output_path.to_string_lossy().to_string())
}
