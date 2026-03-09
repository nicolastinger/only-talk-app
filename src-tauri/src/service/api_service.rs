use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use anyhow::anyhow;
use reqwest::{Client, Response};
use reqwest::header::HeaderMap;

use crate::GLOBAL_QUIC_USER_INFO;

pub async fn post_with_body(url: String, body: HashMap<String, String>) -> Result<Response, anyhow::Error> {
    let client = Client::builder().timeout(std::time::Duration::from_secs(30)).build()?;

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse()?);

    let response = client.post(&url).json(&body).headers(headers).send().await?;
    Ok(response)
}

pub async fn get_with_token(url: String) -> Result<Response, anyhow::Error> {
    let client = Client::builder().timeout(std::time::Duration::from_secs(30)).build()?;

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse()?);

    let response = client.get(&url).headers(headers).send().await?;
    Ok(response)
}

pub async fn upload_file(
    url: &str,
    file_path: &str,
    field_name: &str,
) -> Result<Response, anyhow::Error> {
    upload_file_with_fields(url, file_path, field_name, vec![]).await
}

pub async fn upload_file_with_fields(
    url: &str,
    file_path: &str,
    field_name: &str,
    extra_fields: Vec<(String, String)>,
) -> Result<Response, anyhow::Error> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(anyhow!("文件不存在: {}", file_path));
    }

    let mut file = File::open(path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()?;

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();

    let mut request = client.post(url);

    if !token.is_empty() {
        let mut headers = HeaderMap::new();
        headers.insert("Authorization", token.parse()?);
        request = request.headers(headers);
    }

    let field_name_owned = field_name.to_string();
    let mut form = reqwest::multipart::Form::new()
        .part(field_name_owned, reqwest::multipart::Part::bytes(buffer).file_name(file_name.to_string()));

    for (key, value) in extra_fields {
        form = form.text(key, value);
    }

    let response = request.multipart(form).send().await?;
    Ok(response)
}

pub async fn upload_multiple_files(
    url: &str,
    file_paths: &[String],
    field_name: &str,
) -> Result<Response, anyhow::Error> {
    upload_multiple_files_with_fields(url, file_paths, field_name, vec![]).await
}

pub async fn upload_multiple_files_with_fields(
    url: &str,
    file_paths: &[String],
    field_name: &str,
    extra_fields: Vec<(String, String)>,
) -> Result<Response, anyhow::Error> {
    if file_paths.is_empty() {
        return Err(anyhow!("文件列表为空"));
    }

    for path in file_paths {
        if !Path::new(path).exists() {
            return Err(anyhow!("文件不存在: {}", path));
        }
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()?;

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();

    let mut request = client.post(url);

    if !token.is_empty() {
        let mut headers = HeaderMap::new();
        headers.insert("Authorization", token.parse()?);
        request = request.headers(headers);
    }

    let field_name_owned = field_name.to_string();
    let mut form = reqwest::multipart::Form::new();
    let mut part_index = 0;

    for file_path in file_paths {
        let path = Path::new(file_path);
        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");

        // Create a unique field name for each file to avoid overwriting
        let unique_field_name = if part_index == 0 {
            field_name_owned.clone()
        } else {
            format!("{}_{}", field_name_owned, part_index)
        };

        form = form.part(
            unique_field_name,
            reqwest::multipart::Part::bytes(buffer).file_name(file_name.to_string()),
        );
        part_index += 1;
    }

    for (key, value) in extra_fields {
        form = form.text(key, value);
    }

    let response = request.multipart(form).send().await?;
    Ok(response)
}

pub async fn post_form_data(
    url: &str,
    fields: HashMap<String, String>,
) -> Result<Response, anyhow::Error> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();

    let mut request = client.post(url);

    if !token.is_empty() {
        let mut headers = HeaderMap::new();
        headers.insert("Authorization", token.parse()?);
        request = request.headers(headers);
    }

    let mut form = reqwest::multipart::Form::new();
    for (key, value) in fields {
        form = form.text(key, value);
    }

    let response = request.multipart(form).send().await?;
    Ok(response)
}
