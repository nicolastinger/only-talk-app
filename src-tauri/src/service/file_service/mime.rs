//! 文件扩展名/类型推断(纯函数)。

use std::path::Path;

// 从Content-Disposition头部提取文件名
pub(super) fn extract_filename_from_content_disposition(
    content_disposition: &str,
) -> Option<String> {
    if content_disposition.is_empty() {
        return None;
    }

    // 查找filename参数
    let filename_start = content_disposition.find("filename=").map(|i| i + 9)?; // "filename="长度为9
    let filename_part = &content_disposition[filename_start..];

    // 处理引号包围的文件名
    let filename = if filename_part.starts_with('"') && filename_part.ends_with('"') {
        filename_part[1..filename_part.len() - 1].to_string()
    } else {
        filename_part.split_whitespace().next()?.to_string()
    };

    Some(filename)
}

/// 从下载 URL 的路径段推断扩展名(对象 key 形如 `<uuid>.<ext>`, 可能带预签名查询串)
pub(super) fn extract_ext_from_url(url: &str) -> Option<String> {
    let no_query = url.split(['?', '#']).next().unwrap_or(url);
    let last_segment = no_query.rsplit('/').next().unwrap_or("");
    let ext = last_segment.rsplit_once('.').map(|(_, ext)| ext)?;
    if ext.is_empty() || ext.contains('=') {
        None
    } else {
        Some(ext.to_lowercase())
    }
}

/// 由响应 Content-Type 推断扩展名(兜底, 仅覆盖常见图片类型)
pub(super) fn extract_ext_from_mime(mime: &str) -> Option<String> {
    let essence = mime.split(';').next().unwrap_or("").trim().to_lowercase();
    let ext = match essence.as_str() {
        "image/webp" => "webp",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        "image/tiff" => "tiff",
        "image/avif" => "avif",
        "image/heic" => "heic",
        _ => return None,
    };
    Some(ext.to_string())
}

// ===== 文件管理（本地 file_record 列表 / 筛选 / 排序 / 删除）=====

/// 文件分类: image / video / audio / document / archive / other
pub(super) fn classify_file_type(file_name: &str, mime_type: &str) -> &'static str {
    let ext =
        Path::new(file_name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" | "heic" | "heif"
        | "avif" => "image",
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" | "m4v" | "ts" | "3gp" => "video",
        "mp3" | "wav" | "m4a" | "aac" | "ogg" | "flac" | "opus" | "wma" | "amr" => "audio",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "csv" | "rtf"
        | "epub" => "document",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" | "cab" => "archive",
        _ => {
            // 扩展名无法识别时按 MIME 兜底
            let mime = mime_type.to_lowercase();
            if mime.starts_with("image/") {
                "image"
            } else if mime.starts_with("video/") {
                "video"
            } else if mime.starts_with("audio/") {
                "audio"
            } else {
                "other"
            }
        }
    }
}
