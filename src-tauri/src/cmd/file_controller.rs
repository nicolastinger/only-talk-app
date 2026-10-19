use std::fs;
use std::path::Path;

use log::{error, info, warn};
use tauri::path::BaseDirectory;
use tauri::{Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::config::get_config;
use crate::models::vo::file_vo::{FileVo, LocalFileVo};
use crate::service::file_service::{
    delete_local_file_service, get_file_by_biz_id_service, get_local_file_list_service,
    has_local_chat_file_service, open_local_file_service,
};
use crate::utils::global_static_str::{talk_api_base, DEFAULT_IMAGE, RESOURCE_PATH};

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
            .resolve(format!("{}/{}", RESOURCE_PATH, DEFAULT_IMAGE), BaseDirectory::Resource)
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
    let url = format!("{}/file/download_link/pub_biz/{}", talk_api_base(), biz_id);
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
    let url = format!("{}/file/download_link/chat_biz/{}/1", talk_api_base(), biz_id);
    let res = get_file_by_biz_id_service(biz_id, url, nano_id).await;
    match res {
        Ok(file_vo) => Ok(file_vo),
        Err(e) => {
            error!("获取文件失败 {}", e);
            Err(e.to_string())
        }
    }
}

/// 判断本地是否已存在该聊天文件（只查本地，不触发下载）
#[tauri::command]
pub async fn has_local_chat_file(biz_id: String) -> Result<bool, String> {
    if biz_id.is_empty() {
        warn!("业务id不能为空");
        return Err("业务id不能为空".to_string());
    }
    has_local_chat_file_service(&biz_id).await.map_err(|e| {
        error!("判断本地文件失败 {}", e);
        e.to_string()
    })
}

/// 获取本地文件大小(字节), 用于前端上传前大小预校验
#[tauri::command]
pub async fn get_local_file_size(path: String) -> Result<u64, String> {
    if path.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(metadata.len())
}

/// 打开外部链接（跨平台）
/// - 桌面: 系统默认浏览器
/// - Android/iOS: 经 opener 插件走系统 Intent / 默认程序
#[tauri::command]
pub async fn open_external_url<R: Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
) -> Result<(), String> {
    if url.is_empty() {
        return Err("URL 不能为空".to_string());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| {
        error!("打开外部链接失败: {}", e);
        e.to_string()
    })
}

/// 打开本地文件（跨平台）
/// - 桌面: 直接交给系统默认程序打开
/// - Android: 复制到 cache 目录后交给 tauri-plugin-view，
///   由插件经 FileProvider 生成 content:// URI 并带 FLAG_GRANT_READ_URI_PERMISSION
///   打开（opener 插件移动端不支持打开文件且缺 URI 授权）
#[tauri::command]
pub async fn open_local_file<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    open_local_file_service(app, path).await
}

/// 获取本地文件列表（文件管理: 分类筛选 + 名称/日期排序）
#[tauri::command]
pub async fn get_local_file_list(
    file_type: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<LocalFileVo>, String> {
    get_local_file_list_service(file_type, sort_by, sort_order).await.map_err(|e| e.to_string())
}

/// 删除本地文件（删物理文件 + 记录）
#[tauri::command]
pub async fn delete_local_file(id: i64) -> Result<(), String> {
    delete_local_file_service(id).await.map_err(|e| e.to_string())
}

/// 读取本地文件原始字节并以「原始字节响应」返回(JS 侧 `invoke` 得到 ArrayBuffer)。
///
/// 移动端语音播放使用: Android WebView 对 `asset:` 协议的媒体加载不可靠
/// (媒体资源加载不经过 shouldInterceptRequest), `<audio>` 直接播 asset URL 会失败。
/// 前端改为取字节后构造 Blob URL 播放；读取走阻塞线程池, 避免大文件卡住异步命令。
#[tauri::command]
pub async fn read_local_file_bytes(file_path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tokio::task::spawn_blocking(move || fs::read(&file_path))
        .await
        .map_err(|e| format!("读取文件线程异常: {}", e))?
        .map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// 将前端录音产生的音频字节写入应用临时目录, 返回 Rust 可读的绝对路径。
///
/// 前端 WebView 的 MediaRecorder 只能得到 Blob(blob: URL), Rust 侧无法直接读取,
/// 故先落盘为真实文件再由 `send_voice_msg` / `send_group_voice_msg` 走附件上传管道。
/// `ext` 为容器扩展名(如 webm/ogg/m4a), 决定服务端 MIME 识别与文件名。
#[tauri::command]
pub async fn save_voice_temp_file<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    bytes: Vec<u8>,
    ext: String,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("录音数据为空".to_string());
    }

    // 仅保留字母数字, 避免路径注入; 缺省 webm
    let safe_ext: String =
        ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase();
    let safe_ext = if safe_ext.is_empty() { "webm".to_string() } else { safe_ext };

    let base_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let temp_dir = base_dir.join("umi_gitee_temp");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_name = format!("voice_{}_{}.{}", timestamp, nanoid::nanoid!(8), safe_ext);
    let file_path = temp_dir.join(file_name);

    fs::write(&file_path, &bytes).map_err(|e| format!("写入录音文件失败: {}", e))?;
    info!("录音文件已保存: {} ({} 字节)", file_path.display(), bytes.len());

    Ok(file_path.to_string_lossy().to_string())
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
        output.push('\n');
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
            output.push('\n');
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
