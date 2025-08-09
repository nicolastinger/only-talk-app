use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Friend {
    pub id: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub friend_id: String,
    pub friend_account: String,
    pub friend_name: String,
    pub friend_icon: String,
    pub friend_info: String,
    pub friend_status: i32,
    pub me: String,
    pub is_del: bool,
    pub is_block: i32,
    pub is_mute: i32,
    pub is_top: i32,
    pub is_show: i32,
    pub version: i32
}