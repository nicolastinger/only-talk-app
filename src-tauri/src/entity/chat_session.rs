use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::vo::chat_session_vo::ChatSessionVo;

#[derive(Debug, Serialize, Deserialize, FromRow)]
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

impl ChatSession {
    pub fn from(chat_session_vo: ChatSessionVo) -> Result<Self, anyhow::Error> {
        Ok(ChatSession {
            id: 0,
            nano_id: chat_session_vo.nano_id,
            timestamp: chat_session_vo.timestamp,
            text_type: chat_session_vo.text_type,
            unread_count: chat_session_vo.unread_count,
            last_message: chat_session_vo.last_message,
            recv_user: chat_session_vo.recv_user,
            send_user: chat_session_vo.send_user,
            session_type: chat_session_vo.session_type,
            is_show: chat_session_vo.is_show,
            is_top: chat_session_vo.is_top,
        })
    }
}