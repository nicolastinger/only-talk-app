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
}

impl ChatRecordRaw for TextRecord {
    fn set_prev_id(&mut self, prev_id: String) {
        self.prev_id = prev_id;
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        let res = serde_json::to_string(&self);
        match res {
            Ok(s) => Ok(s),
            Err(e) => Err(anyhow!("文本消息序列化失败: {}", e))
        }
    }

    fn deserialize(raw: &str) -> Result<Self, anyhow::Error> {
        let res = serde_json::from_str(raw);
        match res {
            Ok(r) => Ok(r),
            Err(e) => Err(anyhow!("文本消息反序列化失败: {}", e))
        }
    }
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ImageRecord {
    pub prev_id: String,
    pub biz_id: String,
    pub is_preview: bool,
    pub img_width: i32,
    pub img_height: i32,
    pub img_size: i32
}

impl ChatRecordRaw for ImageRecord {
    fn set_prev_id(&mut self, prev_id: String) {
        self.prev_id = prev_id;
    }

    fn json_serialize(&self) -> Result<String, anyhow::Error> {
        let res = serde_json::to_string(&self);
        match res {
            Ok(s) => Ok(s),
            Err(e) => Err(anyhow!("图片消息序列化失败: {}", e))
        }
    }

    fn deserialize(raw: &str) -> Result<Self, anyhow::Error> {
        let res = serde_json::from_str(raw);
        match res {
            Ok(r) => Ok(r),
            Err(e) => Err(anyhow!("图片消息反序列化失败: {}", e))
        }
    }
}