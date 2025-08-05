use serde::{Deserialize, Serialize};
use sqlx::FromRow;

pub mod quic_connection;
pub mod text_msg;
pub mod user;
pub(crate) mod p2p_models;
pub mod chat_session;
mod friend;

#[derive(Debug, Serialize, Deserialize)]
pub struct Page {
    pub size: i64,
    pub current: i64,
    pub total: i64,
}