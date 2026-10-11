use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};

use anyhow::anyhow;
use reqwest::header::HeaderMap;
use reqwest::Response;
use serde::Serialize;
use tokio::io::{AsyncRead, ReadBuf};
use tokio_util::io::ReaderStream;

use crate::utils::http_client::{
    http_client_120, http_client_30, http_client_300, http_client_600,
};
use crate::GLOBAL_QUIC_USER_INFO;

/// 上传进度回调: (已上传字节, 总字节)
pub type UploadProgressFn = Arc<dyn Fn(u64, u64) + Send + Sync>;

/// 边读边上报进度的 AsyncRead 包装器(节流 100ms, 完成时必发一次)。
struct ProgressReader<R> {
    inner: R,
    uploaded: u64,
    total: u64,
    last: Instant,
    on_progress: UploadProgressFn,
}

impl<R: AsyncRead + Unpin> AsyncRead for ProgressReader<R> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        let before = buf.filled().len();
        let result = Pin::new(&mut this.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &result {
            let read = buf.filled().len().saturating_sub(before);
            if read > 0 {
                this.uploaded += read as u64;
                let finished = this.total > 0 && this.uploaded >= this.total;
                if finished || this.last.elapsed() >= Duration::from_millis(100) {
                    (this.on_progress)(this.uploaded, this.total);
                    this.last = Instant::now();
                }
            }
        }
        result
    }
}

pub async fn post_with_body(
    url: String,
    body: HashMap<String, String>,
) -> Result<Response, anyhow::Error> {
    let client = http_client_30();

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse()?);

    let response = client.post(&url).json(&body).headers(headers).send().await?;
    Ok(response)
}

pub async fn post_json<T: Serialize>(url: String, body: &T) -> Result<Response, anyhow::Error> {
    let client = http_client_30();

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse()?);

    let response = client.post(&url).json(body).headers(headers).send().await?;
    Ok(response)
}

pub async fn get_with_token(url: String) -> Result<Response, anyhow::Error> {
    let client = http_client_30();

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", token.parse()?);

    let response = client.get(&url).headers(headers).send().await?;
    Ok(response)
}

pub async fn get_without_token(url: String) -> Result<Response, anyhow::Error> {
    // 该函数用于下载文件(预签名 URL 拉取二进制), 用 10 分钟超时, 避免大文件下载超时
    let client = http_client_600();
    let response = client.get(&url).send().await?;
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
    use log::info;

    let path = Path::new(file_path);
    if !path.exists() {
        return Err(anyhow!("文件不存在: {}", file_path));
    }

    let mut file = File::open(path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");

    let client = http_client_120();

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();

    info!(
        "upload_file_with_fields - URL: {}, Token length: {}, Token preview: {}",
        url,
        token.len(),
        if token.len() > 20 { &token[..20] } else { &token }
    );

    let mut request = client.post(url);

    if !token.is_empty() {
        let mut headers = HeaderMap::new();
        headers.insert("Authorization", token.parse()?);
        request = request.headers(headers);
        info!("Authorization header added");
    } else {
        info!("Token is empty, skipping Authorization header");
    }

    let field_name_owned = field_name.to_string();
    let mut form = reqwest::multipart::Form::new().part(
        field_name_owned,
        reqwest::multipart::Part::bytes(buffer).file_name(file_name.to_string()),
    );

    for (key, value) in extra_fields {
        form = form.text(key, value);
    }

    let response = request.multipart(form).send().await?;
    info!("upload_file_with_fields - Response status: {}", response.status());
    Ok(response)
}

/// 流式上传单个文件并上报字节进度(避免整文件读入内存, 支持大文件)。
/// `on_progress` 为空时同样流式上传, 只是不上报进度。
pub async fn upload_file_with_progress(
    url: &str,
    file_path: &str,
    field_name: &str,
    on_progress: Option<UploadProgressFn>,
) -> Result<Response, anyhow::Error> {
    use log::info;

    let path = Path::new(file_path);
    if !path.exists() {
        return Err(anyhow!("文件不存在: {}", file_path));
    }

    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();

    let client = http_client_120();

    let empty_token = String::new();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").unwrap_or(&empty_token).clone();

    let mut request = client.post(url);
    if !token.is_empty() {
        let mut headers = HeaderMap::new();
        headers.insert("Authorization", token.parse()?);
        request = request.headers(headers);
    }

    let file = tokio::fs::File::open(path).await?;
    let total = file.metadata().await?.len();
    info!(
        "upload_file_with_progress - file: {}, size: {}, url: {}",
        file_path, total, url
    );

    let part = match on_progress {
        Some(on_progress) => {
            let reader =
                ProgressReader { inner: file, uploaded: 0, total, last: Instant::now(), on_progress };
            let stream = ReaderStream::new(reader);
            let body = reqwest::Body::wrap_stream(stream);
            reqwest::multipart::Part::stream_with_length(body, total).file_name(file_name)
        }
        None => {
            let stream = ReaderStream::new(file);
            let body = reqwest::Body::wrap_stream(stream);
            reqwest::multipart::Part::stream_with_length(body, total).file_name(file_name)
        }
    };

    let form = reqwest::multipart::Form::new().part(field_name.to_string(), part);
    let response = request.multipart(form).send().await?;
    info!("upload_file_with_progress - Response status: {}", response.status());
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

    let client = http_client_300();

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
    for (part_index, file_path) in file_paths.iter().enumerate() {
        let path = Path::new(file_path);
        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");

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
    let client = http_client_30();

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
