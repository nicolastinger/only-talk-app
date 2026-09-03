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
    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse().map_err(|_| "token错误".to_string())?);

    let response = client.get(&url).headers(headers).send().await.map_err(|e| e.to_string())?;

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
pub async fn put_request(url: String, body: String) -> Result<ApiResponse, String> {
    let client = Client::new();
    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse().map_err(|_| "token错误".to_string())?);

    let json_body: Value = serde_json::from_str(&body).unwrap_or(Value::String(body));

    let response = client
        .put(&url)
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
pub async fn delete_request(url: String, body: String) -> Result<ApiResponse, String> {
    let client = Client::new();
    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse().map_err(|_| "token错误".to_string())?);

    let json_body: Value = serde_json::from_str(&body).unwrap_or(Value::String(body));

    let response = client
        .delete(&url)
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
    info!(
        "upload_file_request called - URL: {}, file_path: {}, field_name: {}",
        url, file_path, field_name
    );

    let response = upload_file(&url, &file_path, &field_name).await.map_err(|e| {
        info!("upload_file error: {}", e);
        e.to_string()
    })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    info!("upload_file_request response - status: {}, body: {}", status, body);

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

/// Android：通过 tauri-plugin-fs(ContentResolver) 读取 content:// URI，
/// 复制到应用数据目录 umi_gitee_temp，返回 Rust 可读的真实路径
#[cfg(target_os = "android")]
fn copy_android_content_uri(app: &tauri::AppHandle, uri: &str) -> Result<String, String> {
    use std::io::Read;
    use tauri::Manager;
    use tauri_plugin_fs::FsExt;

    let mut file = app
        .fs()
        .open(
            tauri_plugin_fs::FilePath::Url(url::Url::parse(uri).map_err(|e| e.to_string())?),
            tauri_plugin_fs::OpenOptions::new().read(true).clone(),
        )
        .map_err(|e| format!("打开 content URI 失败: {}", e))?;

    let mut data = Vec::new();
    file.read_to_end(&mut data).map_err(|e| format!("读取 content URI 失败: {}", e))?;

    let base_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let temp_dir = base_dir.join("umi_gitee_temp");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_file = temp_dir.join(format!("img_{}.jpg", timestamp));

    std::fs::write(&temp_file, &data).map_err(|e| format!("写入临时文件失败: {}", e))?;
    info!("Content URI copied to: {}", temp_file.display());
    Ok(temp_file.to_string_lossy().to_string())
}

/// 将文件（包括 Android content:// URI）复制到临时目录并返回真实路径
#[command]
pub async fn copy_file_to_temp(
    app: tauri::AppHandle,
    uri_or_path: String,
) -> Result<String, String> {
    info!("copy_file_to_temp called: {}", uri_or_path);

    // 如果不是 content URI，直接返回原路径
    if !uri_or_path.starts_with("content://") {
        info!("Not a content URI, returning as-is");
        return Ok(uri_or_path);
    }

    #[cfg(target_os = "android")]
    {
        copy_android_content_uri(&app, &uri_or_path)
    }

    #[cfg(not(target_os = "android"))]
    {
        Err("content:// URI 仅在 Android 环境支持".to_string())
    }
}
