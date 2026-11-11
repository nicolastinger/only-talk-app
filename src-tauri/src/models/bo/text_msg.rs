use serde::{Deserialize, Serialize};

pub trait TextMsg {
    fn get_bytes(&self) -> anyhow::Result<Vec<u8>>;
}

//头部消息
#[derive(Debug, Serialize, Deserialize)]
pub struct HeadMsg {
    pub version: u8,
    pub crc: u16,
    pub body_len: u32,     // 消息体长度
    pub message_type: u16, // 消息类型, 1-好友单聊
}

//文本信息消息体
#[derive(Debug, Serialize, Deserialize)]
pub struct TextQuicMsg {
    pub nano_id: String,   //消息id
    pub text_type: u16,    //消息类型
    pub raw: Vec<u8>,      //二进制数据
    pub recv_user: String, //接收用户
    pub send_user: String, //发送用户
    pub timestamp: i64,    //消息时间戳
}

impl TextMsg for HeadMsg {
    fn get_bytes(&self) -> anyhow::Result<Vec<u8>> {
        Ok(bincode::serialize(self)?)
    }
}

impl TextMsg for TextQuicMsg {
    fn get_bytes(&self) -> anyhow::Result<Vec<u8>> {
        Ok(bincode::serialize(self)?)
    }
}
