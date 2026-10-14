use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpResult {
    pub code: i32,
    pub data: Value,
    pub message: String,
}
