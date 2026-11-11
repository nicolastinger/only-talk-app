use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileVo {
    pub file_id: Option<String>,
    pub size: Option<i64>,
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
    pub absolute_file_path: Option<String>,
    pub raw: Option<Vec<u8>>,
    pub is_del: Option<i32>,
}

/// 本地文件管理列表项（file_record 表, status=0 且物理文件存在）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFileVo {
    pub id: i64,
    pub biz_id: String,
    pub uuid: String,
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub created_at: i64,
    /// 分类: image / video / audio / document / archive / other
    pub file_type: String,
    /// 扩展名(小写, 无点)
    pub ext: String,
}
