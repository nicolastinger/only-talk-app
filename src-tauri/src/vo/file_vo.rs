use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileVo {
    pub file_id: Option<String>,
    pub size: Option<u64>,
    pub file_hash: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub status: Option<i32>,
    pub file_extension: Option<String>,
    pub mime_type: Option<String>,
    pub description: Option<String>,
    pub original_file_name: Option<String>,
    pub original_file_path: Option<String>,
    pub relative_path: Option<String>,
    pub relative_file_name: Option<String>,
    pub raw: Option<Vec<u8>>,
    pub is_del: Option<i32>,
}
