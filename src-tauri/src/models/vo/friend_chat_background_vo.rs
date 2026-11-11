use serde::Serialize;

/// 好友专属聊天背景视图(返回给前端)。
#[derive(Debug, Clone, Serialize)]
pub struct FriendChatBackgroundVo {
    pub friend_uuid: String,
    pub file_name: String,
    /// 绝对文件路径(位于 app_data_dir/chat_backgrounds/)
    pub file_path: String,
    pub created_at: i64,
}
