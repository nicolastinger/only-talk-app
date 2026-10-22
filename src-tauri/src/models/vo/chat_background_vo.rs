use serde::Serialize;

/// 聊天背景视图(返回给前端): 携带解析后的绝对路径, 前端用 convertFileSrc 转成可访问 URL。
#[derive(Debug, Clone, Serialize)]
pub struct ChatBackgroundVo {
    pub id: i64,
    pub file_name: String,
    /// 绝对文件路径(位于 app_data_dir/chat_backgrounds/)
    pub file_path: String,
    pub is_active: bool,
    pub created_at: i64,
}
