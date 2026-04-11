use anyhow::anyhow;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

pub trait ChatRecordRaw {
    fn set_prev_id(&mut self, prev_id: String);
    fn json_serialize(&self) -> Result<String, anyhow::Error>;
    fn deserialize(raw: &str) -> Result<Self, anyhow::Error>
    where
        Self: Sized;
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct TextRecord {
    pub prev_id: String,
    pub text: String,
    pub platform: u8,
}

impl ChatRecordRaw for TextRecord {
    fn set_prev_id(&mut self, prev_id: String) {
        self.prev_id = prev_id;
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        let res = serde_json::to_string(&self);
        match res {
            Ok(s) => Ok(s),
            Err(e) => Err(anyhow!("文本消息序列化失败: {}", e)),
        }
    }

    fn deserialize(raw: &str) -> Result<Self, anyhow::Error> {
        let res = serde_json::from_str(raw);
        match res {
            Ok(r) => Ok(r),
            Err(e) => Err(anyhow!("文本消息反序列化失败: {}", e)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ImageRecord {
    pub prev_id: String,
    pub biz_id: String,
    pub file_name: String,
    pub is_preview: bool,
    pub img_width: i32,
    pub img_height: i32,
    pub img_size: i32,
    pub platform: u8,
}

impl ChatRecordRaw for ImageRecord {
    fn set_prev_id(&mut self, prev_id: String) {
        self.prev_id = prev_id;
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        let res = serde_json::to_string(&self);
        match res {
            Ok(s) => Ok(s),
            Err(e) => Err(anyhow!("图片消息序列化失败: {}", e)),
        }
    }

    fn deserialize(raw: &str) -> Result<Self, anyhow::Error> {
        let res = serde_json::from_str(raw);
        match res {
            Ok(r) => Ok(r),
            Err(e) => Err(anyhow!("图片消息反序列化失败: {}", e)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct FileRecord {
    pub prev_id: String,
    pub biz_id: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_type: String,
    pub platform: u8,
}

impl ChatRecordRaw for FileRecord {
    fn set_prev_id(&mut self, prev_id: String) {
        self.prev_id = prev_id;
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        let res = serde_json::to_string(&self);
        match res {
            Ok(s) => Ok(s),
            Err(e) => Err(anyhow!("文件消息序列化失败: {}", e)),
        }
    }

    fn deserialize(raw: &str) -> Result<Self, anyhow::Error> {
        let res = serde_json::from_str(raw);
        match res {
            Ok(r) => Ok(r),
            Err(e) => Err(anyhow!("文件消息反序列化失败: {}", e)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebRTCSignalRecord {
    #[serde(default)]
    pub prev_id: String,
    #[serde(rename = "type")]
    pub signal_type: String,
    pub sender: String,
    pub receiver: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub data: serde_json::Value,
    pub timestamp: i64,
}

impl ChatRecordRaw for WebRTCSignalRecord {
    fn set_prev_id(&mut self, prev_id: String) {
        self.prev_id = prev_id;
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        let res = serde_json::to_string(&self);
        match res {
            Ok(s) => Ok(s),
            Err(e) => Err(anyhow!("WebRTC信令消息序列化失败: {}", e)),
        }
    }

    fn deserialize(raw: &str) -> Result<Self, anyhow::Error> {
        let res = serde_json::from_str(raw);
        match res {
            Ok(r) => Ok(r),
            Err(e) => Err(anyhow!("WebRTC信令消息反序列化失败: {}", e)),
        }
    }
}
