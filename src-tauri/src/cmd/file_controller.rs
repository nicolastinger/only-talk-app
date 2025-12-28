use std::fs;
use std::path::Path;
use crate::vo::file_vo::FileVo;

/// 增加持久化数据
#[tauri::command]
pub async fn get_local_file() -> Result<FileVo, String> {
    let resource_path = Path::new("./resource/default.jpg");
    
    if !resource_path.exists() {
        return Err("文件不存在".to_string());
    }
    
    let metadata = fs::metadata(resource_path)
        .map_err(|e| format!("读取文件元数据失败: {}", e))?;
    
    let file_name = resource_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("11111.jpg")
        .to_string();
    
    let file_content = fs::read(resource_path)
        .map_err(|e| format!("读取文件内容失败: {}", e))?;
    
    let file_vo = FileVo {
        file_id: None,
        size: Some(metadata.len()),
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
        relative_path: Some("./resource".to_string()),
        relative_file_name: Some("11111.jpg".to_string()),
        raw: Some(file_content),
        is_del: Some(0),
    };
    
    Ok(file_vo)
}