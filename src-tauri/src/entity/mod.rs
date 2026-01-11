use serde::{Deserialize, Serialize};

pub mod chat_record_read;
pub mod chat_session;
pub mod file_record;
pub mod friend;
pub(crate) mod p2p_models;
pub mod quic_connection;
pub mod system_notification;
pub mod text_msg;
pub mod user;
pub mod chat_record;
pub mod chat_record_ack;

#[derive(Debug, Serialize, Deserialize)]
pub struct Page {
    pub size: i64,
    pub current: i64,
    pub total: i64,
}
