#![cfg(test)]

use app_lib::cmd::api_controller::{post_form_data_request, upload_file_request, ApiResponse};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

fn create_test_file() -> PathBuf {
    let temp_dir = std::env::temp_dir();
    let path = temp_dir.join("test_upload.txt");
    let mut file = fs::File::create(&path).unwrap();
    file.write_all(b"Hello, this is a test file content!").unwrap();
    path
}

#[tokio::test]
async fn test_post_form_data_request_success() {
    let mut fields = HashMap::new();
    fields.insert("username".to_string(), "testuser".to_string());
    fields.insert("email".to_string(), "test@example.com".to_string());

    let result: Result<ApiResponse, String> =
        post_form_data_request("http://httpbin.org/post".to_string(), fields).await;
    assert!(result.is_ok());

    let response = result.unwrap();
    assert_eq!(response.status, 200);
}

#[tokio::test]
async fn test_upload_file_request_file_not_exists() {
    let result: Result<ApiResponse, String> = upload_file_request(
        "http://example.com/upload".to_string(),
        "/nonexistent/path/file.txt".to_string(),
        "file".to_string(),
    )
    .await;

    assert!(result.is_err());
}

#[tokio::test]
async fn test_upload_file_request_success() {
    let test_file = create_test_file();

    let result: Result<ApiResponse, String> = upload_file_request(
        "http://httpbin.org/post".to_string(),
        test_file.to_string_lossy().to_string(),
        "file".to_string(),
    )
    .await;

    assert!(result.is_ok());

    let response = result.unwrap();
    assert_eq!(response.status, 200);

    fs::remove_file(&test_file).ok();
}
