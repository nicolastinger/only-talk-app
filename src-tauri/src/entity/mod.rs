use serde::{Deserialize, Serialize};
use sqlx::FromRow;

pub mod chat_record_read;
pub mod chat_session;
pub mod friend;
pub(crate) mod p2p_models;
pub mod quic_connection;
pub mod system_notification;
pub mod text_msg;
pub mod user;

#[derive(Debug, Serialize, Deserialize)]
pub struct Page {
    pub size: i64,
    pub current: i64,
    pub total: i64,
}
