use serde::{Deserialize, Serialize};

pub struct FriendVo {
    pub timestamp: i64,
    pub friend_id: String,
    pub friend_account: String,
    pub friend_name: String,
    pub friend_icon: String,
    pub friend_status: i32,
    pub is_deleted: i32,
    pub is_block: i32,
    pub is_mute: i32,
    pub is_top: i32,
    pub is_show: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FriendListVO {
    pub uuid: String,
    pub account: String,
    pub username: String,
    pub icon: String,
    pub info: String,
    pub is_del: bool,
    pub version: i32,
    pub created_at: i64,
    pub updated_at: i64,
}