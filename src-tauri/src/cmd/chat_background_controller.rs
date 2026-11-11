//! 聊天背景(仅客户端): 图片复制到独立目录 + 用户库记录表, 支持历史切换。
//!
//! 目录固定为 `app_data_dir/chat_backgrounds/`, 独立于 `umi_gitee_temp` 等临时目录,
//! 不会被任何清理逻辑删除(只有用户主动删除记录时才会移除对应文件)。
//!
//! 两类背景共用同一目录:
//! - 全局背景(`chat_background` 表, 带历史与 is_active);
//! - 好友专属背景(`friend_chat_background` 表, 每个好友最多一张), 聊天页优先使用。

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::dao::{chat_background_db, friend_chat_background_db};
use crate::models::entity::chat_background::ChatBackground;
use crate::models::vo::chat_background_vo::ChatBackgroundVo;
use crate::models::vo::friend_chat_background_vo::FriendChatBackgroundVo;
use crate::utils::time::get_now_time_stamp_as_millis;

/// 聊天背景存放目录(相对应用数据目录)
const CHAT_BG_DIR: &str = "chat_backgrounds";
/// 单张背景大小上限: 30MB
const MAX_BACKGROUND_BYTES: u64 = 30 * 1024 * 1024;
/// 允许的图片扩展名
const ALLOWED_EXTS: [&str; 6] = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];

fn chat_bg_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join(CHAT_BG_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建聊天背景目录失败: {e}"))?;
    Ok(dir)
}

/// 校验并复制图片到永久背景目录, 返回(目录, 文件名)。
async fn copy_background_file(
    app: &AppHandle,
    uri_or_path: &str,
) -> Result<(PathBuf, String), String> {
    let src = PathBuf::from(uri_or_path);
    let ext = src.extension().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase();
    if !ALLOWED_EXTS.contains(&ext.as_str()) {
        return Err("仅支持 jpg/png/webp/bmp/gif 图片".to_string());
    }

    let metadata = tokio::fs::metadata(&src).await.map_err(|e| format!("读取图片失败: {e}"))?;
    if !metadata.is_file() {
        return Err("请选择图片文件".to_string());
    }
    if metadata.len() > MAX_BACKGROUND_BYTES {
        return Err("图片不能超过 30MB".to_string());
    }

    let dir = chat_bg_dir(app)?;
    let timestamp = get_now_time_stamp_as_millis().map_err(|e| e.to_string())?;
    let file_name = format!("bg_{timestamp}_{}.{ext}", nanoid::nanoid!(8));
    tokio::fs::copy(&src, dir.join(&file_name))
        .await
        .map_err(|e| format!("保存背景图片失败: {e}"))?;
    Ok((dir, file_name))
}

fn to_vo(dir: &Path, row: ChatBackground) -> ChatBackgroundVo {
    ChatBackgroundVo {
        id: row.id,
        file_path: dir.join(&row.file_name).to_string_lossy().to_string(),
        file_name: row.file_name,
        is_active: row.is_active == 1,
        created_at: row.created_at,
    }
}

fn to_friend_vo(
    dir: &Path,
    friend_uuid: String,
    row_file_name: String,
    created_at: i64,
) -> FriendChatBackgroundVo {
    FriendChatBackgroundVo {
        file_path: dir.join(&row_file_name).to_string_lossy().to_string(),
        file_name: row_file_name,
        friend_uuid,
        created_at,
    }
}

/// 导入一张图片作为全局聊天背景: 复制到永不过期的背景目录, 写入记录并立即生效。
#[tauri::command]
pub async fn import_chat_background(
    app: AppHandle,
    uri_or_path: String,
) -> Result<ChatBackgroundVo, String> {
    let (dir, file_name) = copy_background_file(&app, &uri_or_path).await?;

    let id = match chat_background_db::insert_and_activate(&file_name).await {
        Ok(id) => id,
        Err(e) => {
            // 入库失败时回滚已复制的文件, 避免产生孤儿文件
            let _ = tokio::fs::remove_file(dir.join(&file_name)).await;
            return Err(e.to_string());
        }
    };

    let row = chat_background_db::get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "背景记录写入失败".to_string())?;
    Ok(to_vo(&dir, row))
}

/// 列出全部全局背景(含历史), 前端据此渲染历史切换列表。
#[tauri::command]
pub async fn list_chat_backgrounds(app: AppHandle) -> Result<Vec<ChatBackgroundVo>, String> {
    let dir = chat_bg_dir(&app)?;
    let rows = chat_background_db::list().await.map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|row| to_vo(&dir, row)).collect())
}

/// 切换生效的全局背景; `id = None` 表示恢复默认(保留历史记录)。
#[tauri::command]
pub async fn set_active_chat_background(app: AppHandle, id: Option<i64>) -> Result<(), String> {
    // 确保目录存在, 便于前端拿到当前配置后直接解析路径
    chat_bg_dir(&app)?;
    let matched =
        chat_background_db::set_active(id.unwrap_or(0)).await.map_err(|e| e.to_string())?;
    if !matched {
        return Err("背景不存在".to_string());
    }
    Ok(())
}

/// 删除一条全局背景(记录 + 磁盘文件); 若删除的是当前生效背景, 聊天页自动回落到默认渐变。
#[tauri::command]
pub async fn delete_chat_background(app: AppHandle, id: i64) -> Result<(), String> {
    let dir = chat_bg_dir(&app)?;
    if let Some(file_name) = chat_background_db::delete(id).await.map_err(|e| e.to_string())? {
        let _ = tokio::fs::remove_file(dir.join(file_name)).await;
    }
    Ok(())
}

/// 为某好友导入专属聊天背景(替换旧图并删除旧文件); 聊天页优先使用它, 否则回退全局背景。
#[tauri::command]
pub async fn import_friend_chat_background(
    app: AppHandle,
    friend_uuid: String,
    uri_or_path: String,
) -> Result<FriendChatBackgroundVo, String> {
    if friend_uuid.trim().is_empty() {
        return Err("好友不存在".to_string());
    }
    let (dir, file_name) = copy_background_file(&app, &uri_or_path).await?;

    let previous = match friend_chat_background_db::upsert(&friend_uuid, &file_name).await {
        Ok(previous) => previous,
        Err(e) => {
            let _ = tokio::fs::remove_file(dir.join(&file_name)).await;
            return Err(e.to_string());
        }
    };

    // 替换成功后再删除旧文件, 避免写入失败时丢失已有背景
    if let Some(old_name) = previous.filter(|name| name != &file_name) {
        let _ = tokio::fs::remove_file(dir.join(old_name)).await;
    }

    let row = friend_chat_background_db::get(&friend_uuid)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "好友背景记录写入失败".to_string())?;
    Ok(to_friend_vo(&dir, friend_uuid, row.file_name, row.created_at))
}

/// 读取某好友的专属背景; 未设置时返回 None(前端回退全局背景)。
#[tauri::command]
pub async fn get_friend_chat_background(
    app: AppHandle,
    friend_uuid: String,
) -> Result<Option<FriendChatBackgroundVo>, String> {
    let dir = chat_bg_dir(&app)?;
    let row = friend_chat_background_db::get(&friend_uuid).await.map_err(|e| e.to_string())?;
    Ok(row.map(|row| to_friend_vo(&dir, friend_uuid, row.file_name, row.created_at)))
}

/// 清除某好友的专属背景, 聊天页回退全局背景。
#[tauri::command]
pub async fn clear_friend_chat_background(
    app: AppHandle,
    friend_uuid: String,
) -> Result<(), String> {
    let dir = chat_bg_dir(&app)?;
    if let Some(file_name) =
        friend_chat_background_db::delete(&friend_uuid).await.map_err(|e| e.to_string())?
    {
        let _ = tokio::fs::remove_file(dir.join(file_name)).await;
    }
    Ok(())
}
