use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::entity::chat_session::ChatSession;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatSessionVo {
    pub nano_id: String,
    pub timestamp: i64,
    pub text_type: u16,
    pub unread_count: i64,
    pub last_message: String,
    pub recv_user: String,
    pub send_user: String,
    pub session_type: i64, //1-单聊，2-群聊，3-系统，4-公众号
    pub is_show: i64,
    pub is_top: i64,
    pub friend_icon: String,
    pub friend_name: String,
}

impl ChatSessionVo {
    pub fn from(chat_session: ChatSession) -> Result<Self, anyhow::Error> {
        Ok(ChatSessionVo {
            nano_id: chat_session.nano_id,
            timestamp: chat_session.timestamp,
            text_type: chat_session.text_type,
            unread_count: chat_session.unread_count,
            last_message: chat_session.last_message,
            recv_user: chat_session.recv_user,
            send_user: chat_session.send_user,
            session_type: chat_session.session_type,
            is_show: chat_session.is_show,
            is_top: chat_session.is_top,
            friend_icon: "".to_string(),
            friend_name: "".to_string(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSessionEvent {
    pub r#type: i32,
    pub data: ChatSessionVo,
}
