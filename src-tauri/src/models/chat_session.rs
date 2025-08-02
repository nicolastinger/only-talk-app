use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSession{
    pub id: i64,
    pub nano_id: String,
    pub timestamp: i64,
    pub text_type: u16,
    pub unread_count: i64,
    pub last_message: String,
    pub recv_user: String,
    pub send_user: String,
    pub session_type: i64,  //1-单聊，2-群聊，3-系统，4-公众号
    pub is_show: i64,
    pub is_top: i64,
}