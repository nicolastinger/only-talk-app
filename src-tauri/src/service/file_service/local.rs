//! 本地文件管理(列表/分类过滤/排序/删除/打开)。

use std::path::Path;

use anyhow::anyhow;
use log::{error, info, warn};
use tauri::Runtime;

use super::mime::classify_file_type;
use crate::dao::file_record_db::{
    delete_file_record_by_pk, list_all_files, query_file_record_by_id,
};
use crate::models::vo::file_vo::LocalFileVo;

/// 获取本地文件列表（仅 status=0 且物理文件存在的记录）
/// - `file_type`: 分类过滤, 空/全部不过滤
/// - `sort_by`: "name"(文件名) 或 "date"(创建时间), 默认 date
/// - `sort_order`: "asc" / "desc", 默认 desc
pub async fn get_local_file_list_service(
    file_type: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<LocalFileVo>, anyhow::Error> {
    let records = list_all_files().await?;
    let mut list = Vec::<LocalFileVo>::new();

    for record in records {
        let Some(file_name) = record.file_name else { continue };
        if file_name.is_empty() {
            continue; // 下载失败占位记录无文件名, 跳过
        }
        let Some(file_path) = record.file_path else { continue };
        // 仅管理仍存在的物理文件（文件被外部删除时不再展示）
        if !Path::new(&file_path).is_file() {
            continue;
        }
        let category = classify_file_type(&file_name, record.mime_type.as_deref().unwrap_or(""));
        if let Some(filter) = file_type.as_deref() {
            if !filter.is_empty() && filter != category {
                continue;
            }
        }
        let ext =
            Path::new(&file_name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        list.push(LocalFileVo {
            id: record.id.unwrap_or(0),
            biz_id: record.biz_id.unwrap_or_default(),
            uuid: record.uuid.unwrap_or_default(),
            file_name,
            file_path,
            file_size: record.file_size.unwrap_or(0),
            mime_type: record.mime_type.unwrap_or_default(),
            created_at: record.created_at.unwrap_or(0),
            file_type: category.to_string(),
            ext,
        });
    }

    match sort_by.as_deref() {
        Some("name") => {
            list.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()))
        }
        _ => list.sort_by(|a, b| a.created_at.cmp(&b.created_at)),
    }
    // 默认降序；显式传 asc 才升序
    if sort_order.as_deref() != Some("asc") {
        list.reverse();
    }

    Ok(list)
}

/// 删除本地文件（删物理文件 + 删 file_record 记录）
pub async fn delete_local_file_service(id: i64) -> Result<(), anyhow::Error> {
    let record = query_file_record_by_id(id).await?.ok_or_else(|| anyhow!("文件记录不存在"))?;

    if let Some(path) = record.file_path {
        if !path.trim().is_empty() {
            let path_ref = Path::new(&path);
            if path_ref.is_file() {
                if let Err(e) = std::fs::remove_file(path_ref) {
                    error!("删除物理文件失败: {} err={}", path, e);
                    return Err(anyhow!("删除物理文件失败: {}", e));
                }
                info!("物理文件已删除: {}", path);
            }
        }
    }

    delete_file_record_by_pk(id).await?;
    Ok(())
}

/// 打开本地文件（跨平台）
/// - 桌面: 直接交给系统默认程序打开
/// - Android: 复制到 cache 目录后交给 tauri-plugin-view，
///   由插件经 FileProvider 生成 content:// URI 并带 FLAG_GRANT_READ_URI_PERMISSION
///   打开（opener 插件移动端不支持打开文件且缺 URI 授权）
pub async fn open_local_file_service<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    if path.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    let file_path = Path::new(&path);
    if !file_path.is_file() {
        warn!("文件不存在: {}", path);
        return Err(format!("文件不存在: {}", path));
    }

    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        // Android: 复制到 cache/open 目录后交给 view 插件打开,
        // 复用 manifest 声明的 ${applicationId}.fileprovider + file_paths.xml 的 cache-path
        let cache_dir = app.path().cache_dir().map_err(|e| format!("获取缓存目录失败: {}", e))?;
        let open_dir = cache_dir.join("open");
        std::fs::create_dir_all(&open_dir).map_err(|e| format!("创建打开目录失败: {}", e))?;

        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "无法获取文件名".to_string())?;

        // 目标文件已存在则跳过复制(同名文件复用)
        let dest = open_dir.join(file_name);
        if !dest.is_file() {
            std::fs::copy(file_path, &dest).map_err(|e| format!("复制文件到缓存失败: {}", e))?;
        }

        info!("Android 打开文件: {:?}", dest);
        use tauri_plugin_view::ViewExt;
        app.view()
            .view(tauri_plugin_view::ViewRequest {
                path: Some(dest.to_string_lossy().into_owned()),
            })
            .map_err(|e| {
                error!("Android 打开文件失败: {}", e);
                e.to_string()
            })?;
        Ok(())
    }

    #[cfg(not(target_os = "android"))]
    {
        use tauri_plugin_opener::OpenerExt;

        info!("打开本地文件: {}", path);
        app.opener().open_path(path, None::<String>).map_err(|e| {
            error!("打开文件失败: {}", e);
            e.to_string()
        })
    }
}
