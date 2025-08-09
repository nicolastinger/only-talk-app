use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AddReadChatRecord {
    pub nano_id: String,
    pub timestamp: i64,
    pub send_user: String,
    pub recv_user: String
}