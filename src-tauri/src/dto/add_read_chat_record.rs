use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AddReadChatRecord {
    pub nano_id: String,
    pub timestamp: i64,
    pub send_user: String,
    pub recv_user: String,
    /// 会话类型 (1: 单聊, 2: 群聊)，后端据此分流
    #[serde(default)]
    pub chat_type: Option<u32>,
}
