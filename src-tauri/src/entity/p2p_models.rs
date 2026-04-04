use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct P2pInitMsg {
    // 请求人地址
    pub accept_addr: String,
    // 请求人地址
    pub request_addr: String,
    // 请求人uuid
    pub request_uuid: String,
    // 请求人token
    pub request_token: String,
    // 接收人uuid
    pub accept_uuid: String,
    // 是否接受
    pub accept: bool,
    // ip类型-v4或者v6
    pub ip_type: u8,
    // 步骤,0-未处理，1-已拒绝，2-已接受，3-交换ip
    pub step: u8,
    // 是否作为服务端
    pub is_server: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserAddressInfo {
    pub uuid: String,
    pub address: String,
    pub token: String,
    pub ip_type: u8,
    pub target_uuid: String,
    pub nat_type: u8,
    pub is_server: bool,
    pub lock_uuid: String,
    pub is_lock: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct P2pVideoData {
    pub uuid: String,
    pub video_data: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct P2pVideoConfig {
    // 宽度
    pub width: u16,
    // 高度
    pub height: u16,
    // 帧率
    pub fps: u8,
    // 编码方式
    pub encode: String,
    // 码率
    pub bitrate: u32,
    // 是否开启视频
    pub video: bool,
    // 是否开启音频
    pub audio: bool,
}

// 前端通信
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pMsg {
    // 消息类型
    pub r#type: u16,
    // 序列化
    pub raw: String,
}
