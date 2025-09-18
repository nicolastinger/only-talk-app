use bincode::Options;
use serde::{Deserialize, Serialize};

pub trait TextMsg {
    fn get_bytes(&self) -> anyhow::Result<Vec<u8>>;
}

#[repr(u16)]
pub enum MessageType {
    Text = 1,
    Image = 2,
    File = 3,
    P2P = 4,
    P2PVideoCall = 5,
    P2pVideoData = 6,
    P2pVideoConfig = 7,

    Ping = 99,
    RecallSuccess = 201,
    RecallFailure = 202,
    P2pUserServer = 203,  //作为p2p服务端发起
    P2pUserClient = 204,  //作为p2p客户端
    System = 10001  // 系统消息
}

//头部消息
#[derive(Debug, Serialize, Deserialize)]
pub struct HeadMsg {
    pub version: u8,
    pub crc: u16,
    pub body_len: u32,       // 消息体长度
    pub message_type: u16,    // 消息类型, 1-好友单聊
}

//文本信息消息体
#[derive(Debug, Serialize, Deserialize)]
pub struct TextQuicMsg {
    pub nano_id: String,
    pub text_type: u16,  //消息类型
    pub raw: Vec<u8>,  //二进制数据
    pub recv_user: String,  //接收用户
    pub send_user: String,   //发送用户
    pub timestamp: i64
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
