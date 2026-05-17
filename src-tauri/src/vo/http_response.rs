use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug)]
pub struct Response {
    pub code: i32,
    pub message: String,
    pub data: Option<Value>,
}
