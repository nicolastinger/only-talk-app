use std::fs;
use std::path::Path;

use log::{error, info, warn};
use tauri::{path::BaseDirectory, Manager, Runtime};

use crate::config::get_config;
use crate::service::file_service::get_file_by_biz_id_service;
use crate::utils::global_static_str::{DEFAULT_IMAGE, RESOURCE_PATH, TALK_API};
use crate::vo::file_vo::FileVo;

/// 增加持久化数据 - 从应用可访问目录读取资源文件
#[tauri::command]
pub async fn get_local_file<R: Runtime>(app_handle: tauri::AppHandle<R>) -> Result<FileVo, String> {
    info!("========== 开始获取本地文件 ==========");

    // 优先从应用目录读取（移动平台已复制资源到此处）
    let app_resource_path = match get_config(RESOURCE_PATH) {
        Some(path) => {
            info!("从配置获取资源路径: {}", path);
            path
        }
        None => {
            error!("获取资源路径配置失败，使用备选方案");
            return create_placeholder_image();
        }
    };

    let resource_path = Path::new(&app_resource_path).join(DEFAULT_IMAGE);
    info!("应用目录资源完整路径: {:?}", resource_path);
    info!("应用目录资源文件是否存在: {}", resource_path.exists());

    // 如果应用目录中不存在，尝试从打包的资源目录读取（桌面平台）
    if !resource_path.exists() {
        warn!("应用目录资源不存在，尝试从打包资源读取");

        let packed_resource_path = match app_handle
            .path()
            .resolve(&format!("{}/{}", RESOURCE_PATH, DEFAULT_IMAGE), BaseDirectory::Resource)
        {
            Ok(path) => {
                info!("解析到的打包资源路径: {:?}", path);
                path
            }
            Err(e) => {
                error!("获取打包资源路径失败: {}，使用备选方案", e);
                return create_placeholder_image();
            }
        };

        let packed_path = Path::new(&packed_resource_path);
        info!("打包资源路径对象: {:?}", packed_path);
        info!("打包资源文件是否存在: {}", packed_path.exists());

        if !packed_path.exists() {
            error!("所有路径的资源文件都不存在，使用备选方案");
            return create_placeholder_image();
        }

        info!("从打包资源读取文件");
        read_file_from_path(packed_path)
    } else {
        info!("从应用目录读取文件");
        read_file_from_path(&resource_path)
    }
}

/// 创建一个简单的占位图片（纯色背景的1x1像素JPEG）
fn create_placeholder_image() -> Result<FileVo, String> {
    warn!("使用占位图片");

    // 简单的1x1像素JPEG（灰度）
    let placeholder_jpg = vec![
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x03, 0x02,
        0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04, 0x05, 0x08, 0x05, 0x05, 0x04, 0x04,
        0x05, 0x0A, 0x07, 0x07, 0x06, 0x08, 0x0C, 0x0C, 0x0C, 0x0B, 0x0A, 0x0B, 0x0B, 0x0D, 0x0E,
        0x12, 0x10, 0x0D, 0x0E, 0x11, 0x0E, 0x0B, 0x0B, 0x10, 0x16, 0x10, 0x11, 0x13, 0x14, 0x15,
        0x15, 0x15, 0x0C, 0x0F, 0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15, 0x14, 0xFF, 0xC0,
        0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x0A, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08,
        0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x37, 0xFF, 0xD9,
    ];

    let file_vo = FileVo {
        file_id: None,
        size: Some(placeholder_jpg.len() as i64),
        file_hash: None,
        created_at: None,
        updated_at: None,
        created_by: None,
        updated_by: None,
        status: Some(1),
        file_extension: Some("jpg".to_string()),
        mime_type: Some("image/jpeg".to_string()),
        description: Some("占位图片".to_string()),
        original_file_name: Some("placeholder.jpg".to_string()),
        original_file_path: Some("internal://placeholder".to_string()),
        absolute_file_path: None,
        raw: Some(placeholder_jpg),
        is_del: Some(0),
    };

    info!("========== 占位图片创建完成 ==========");
    Ok(file_vo)
}

/// 从路径读取文件的辅助函数
fn read_file_from_path(resource_path: &Path) -> Result<FileVo, String> {
    info!("准备读取文件: {:?}", resource_path);

    let metadata = fs::metadata(resource_path).map_err(|e| {
        error!("读取文件元数据失败: {} (路径: {:?})", e, resource_path);
        format!("读取文件元数据失败: {}", e)
    })?;

    info!("文件元数据获取成功，大小: {} bytes", metadata.len());

    let file_name =
        resource_path.file_name().and_then(|n| n.to_str()).unwrap_or(DEFAULT_IMAGE).to_string();

    let file_content = fs::read(resource_path).map_err(|e| {
        error!("读取文件内容失败: {} (路径: {:?})", e, resource_path);
        format!("读取文件内容失败: {}", e)
    })?;

    info!("文件内容读取成功，字节数: {}", file_content.len());

    let file_vo = FileVo {
        file_id: None,
        size: Some(metadata.len() as i64),
        file_hash: None,
        created_at: None,
        updated_at: None,
        created_by: None,
        updated_by: None,
        status: Some(1),
        file_extension: Some("jpg".to_string()),
        mime_type: Some("image/jpeg".to_string()),
        description: None,
        original_file_name: Some(file_name),
        original_file_path: Some(resource_path.to_string_lossy().to_string()),
        absolute_file_path: None,
        raw: Some(file_content),
        is_del: Some(0),
    };

    info!("========== 文件读取完成 ==========");
    Ok(file_vo)
}

/// 通过业务id获取公开文件
#[tauri::command]
pub async fn get_file_by_biz_id(
    biz_id: String,
    nano_id: Option<String>,
) -> Result<Vec<FileVo>, String> {
    info!("通过业务id获取文件 {}, nano_id: {:?}", biz_id, nano_id);
    if biz_id.is_empty() {
        warn!("业务id不能为空");
        return Err("业务id不能为空".to_string());
    }
    let url = format!("{}/file/download_link/pub_biz/{}", TALK_API, biz_id);
    let res = get_file_by_biz_id_service(biz_id, url, nano_id).await;
    match res {
        Ok(file_vo) => Ok(file_vo),
        Err(e) => {
            error!("获取文件失败 {}", e);
            Err(e.to_string())
        }
    }
}

/// 通过业务id获取聊天文件
#[tauri::command]
pub async fn get_chat_file_by_biz_id(
    biz_id: String,
    nano_id: Option<String>,
) -> Result<Vec<FileVo>, String> {
    info!("通过业务id获取文件 {}, nano_id: {:?}", biz_id, nano_id);
    if biz_id.is_empty() {
        warn!("业务id不能为空");
        return Err("业务id不能为空".to_string());
    }
    let url = format!("{}/file/download_link/chat_biz/{}/1", TALK_API, biz_id);
    let res = get_file_by_biz_id_service(biz_id, url, nano_id).await;
    match res {
        Ok(file_vo) => Ok(file_vo),
        Err(e) => {
            error!("获取文件失败 {}", e);
            Err(e.to_string())
        }
    }
}

/// 调试命令：列出所有资源路径和文件
#[tauri::command]
pub async fn debug_resource_paths<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> Result<String, String> {
    use tauri::path::BaseDirectory;

    let mut output = String::new();
    output.push_str("========== 资源路径调试信息 ==========\n\n");

    // 1. 配置的资源路径
    if let Some(config_path) = get_config(RESOURCE_PATH) {
        output.push_str(&format!("配置的资源路径: {}\n", config_path));
        let config_dir = Path::new(&config_path);
        output.push_str(&format!("  是否存在: {}\n", config_dir.exists()));

        if config_dir.exists() {
            if let Ok(entries) = fs::read_dir(config_dir) {
                output.push_str("  目录内容:\n");
                for entry in entries.flatten() {
                    output.push_str(&format!("    - {:?}\n", entry.file_name()));
                }
            }
        }
        output.push_str("\n");
    }

    // 2. 打包的资源路径
    let packed_path = match app_handle.path().resolve(RESOURCE_PATH, BaseDirectory::Resource) {
        Ok(path) => {
            output.push_str(&format!("打包的资源路径: {:?}\n", path));
            let packed_dir = Path::new(&path);
            output.push_str(&format!("  是否存在: {}\n", packed_dir.exists()));

            if packed_dir.exists() {
                if let Ok(entries) = fs::read_dir(packed_dir) {
                    output.push_str("  目录内容:\n");
                    for entry in entries.flatten() {
                        output.push_str(&format!("    - {:?}\n", entry.file_name()));
                    }
                }
            }
            output.push_str("\n");
            Some(path)
        }
        Err(e) => {
            output.push_str(&format!("获取打包资源路径失败: {}\n\n", e));
            None
        }
    };

    // 3. 默认图片路径
    if let Some(packed_base) = packed_path {
        let default_img_path = Path::new(&packed_base).join(DEFAULT_IMAGE);
        output.push_str(&format!("默认图片路径: {:?}\n", default_img_path));
        output.push_str(&format!("  是否存在: {}\n", default_img_path.exists()));

        if default_img_path.exists() {
            if let Ok(metadata) = fs::metadata(&default_img_path) {
                output.push_str(&format!("  大小: {} bytes\n", metadata.len()));
            }
        }
    }

    output.push_str("\n========================================\n");
    Ok(output)
}
