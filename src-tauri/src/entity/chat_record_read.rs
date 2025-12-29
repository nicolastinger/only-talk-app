use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatRecordRead {
    pub id: i64,
    pub nano_id: String,
    pub timestamp: i64,
    pub recv_user: String,
    pub send_user: String,
}
