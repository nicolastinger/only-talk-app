use std::fmt;
use std::sync::Arc;

use quinn::SendStream;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

//quic服务器
#[derive(Debug)]
pub struct QuicConnection {
    pub is_online: bool,
    pub uuid: String,
    pub connection_type: ConnectionType,
    pub send_stream: Arc<RwLock<SendStream>>,
    pub create_time: u64,
    pub update_time: u64,
    pub ipv4addr: String,
    pub ipv6addr: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FirstQuicMsg {
    pub token: String,             //用户token
    pub uuid: String,              //用户id
    pub msg_type: ConnectionType,  //流数据类型,文字，图文，视频，其他实现。
    pub text_serde_struct: String, //文字类型序列化的struct
    pub dyn_buffer_size: usize,    //缓冲区大小
    pub dyn_header_size: usize,    //头部大小
}

impl fmt::Display for ConnectionType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConnectionType::Text => write!(f, "text"),
            ConnectionType::Img => write!(f, "img"),
            ConnectionType::Video => write!(f, "video"),
            ConnectionType::File => write!(f, "file"),
            ConnectionType::Other => write!(f, "other"),
        }
    }
}

impl FirstQuicMsg {
    pub(crate) fn new() -> FirstQuicMsg {
        FirstQuicMsg {
            token: "".to_string(),
            uuid: "".to_string(),
            msg_type: ConnectionType::Text,
            text_serde_struct: "".to_string(),
            dyn_buffer_size: 0,
            dyn_header_size: 0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ConnectionType {
    Text,
    Img,
    Video,
    File,
    Other,
}
