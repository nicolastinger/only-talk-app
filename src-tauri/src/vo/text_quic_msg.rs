use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::entity::text_msg::TextQuicMsg;

//文本信息消息体
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct TextQuicMsgVo {
    pub nano_id: String,   //消息id
    pub text_type: u16,    //消息类型
    pub raw: String,       //数据
    pub recv_user: String, //接收用户
    pub send_user: String, //发送用户
    pub timestamp: i64,    //消息时间戳
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
            timestamp: text_quic_msg.timestamp,
        })
    }

    pub fn from_vec(text_quic_msg: Vec<TextQuicMsg>) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
        let mut text_quic_msg_vo = Vec::new();
        for text_quic_msg in text_quic_msg.into_iter() {
            let raw = String::from_utf8(text_quic_msg.raw)?;
            let temp = TextQuicMsgVo {
                nano_id: text_quic_msg.nano_id,
                text_type: text_quic_msg.text_type,
                raw,
                recv_user: text_quic_msg.recv_user,
                send_user: text_quic_msg.send_user,
                timestamp: text_quic_msg.timestamp,
            };
            text_quic_msg_vo.push(temp);
        }
        Ok(text_quic_msg_vo)
    }
}
