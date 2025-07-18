use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::models::text_msg::TextQuicMsg;

//文本信息消息体
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct TextQuicMsgVo {
    pub nano_id: String,
    pub text_type: u16,  //消息类型
    pub raw: String,  //数据
    pub recv_user: String,  //接收用户
    pub send_user: String,   //发送用户
    pub timestamp: i64
}

impl TextQuicMsgVo {
    pub fn from(text_quic_msg: TextQuicMsg) -> Result<TextQuicMsgVo, anyhow::Error> {
        let raw = String::from_utf8(text_quic_msg.raw)?;
        Ok(TextQuicMsgVo {
            nano_id: text_quic_msg.nano_id,
            text_type: text_quic_msg.text_type,
            raw,
            recv_user: text_quic_msg.recv_user,
            send_user: text_quic_msg.send_user,
            timestamp: text_quic_msg.timestamp
        })
    }
}