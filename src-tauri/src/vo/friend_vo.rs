use serde::{Deserialize, Serialize};

use crate::entity::friend::Friend;

#[derive(Serialize, Deserialize, Debug)]
pub struct FriendVo {
    pub timestamp: i64,
    pub friend_id: String,
    pub friend_account: String,
    pub friend_name: String,
    pub friend_icon: String,
    pub friend_status: i32,
    pub is_del: bool,
    pub is_block: i32,
    pub is_mute: i32,
    pub is_top: i32,
    pub is_show: i32,
}

impl From<Friend> for FriendVo {
    fn from(friend: Friend) -> Self {
        FriendVo {
            timestamp: friend.updated_at,
            friend_id: friend.friend_id,
            friend_account: friend.friend_account,
            friend_name: friend.friend_name,
            friend_icon: friend.friend_icon,
            friend_status: friend.friend_status,
            is_del: friend.is_del,
            is_block: friend.is_block,
            is_mute: friend.is_mute,
            is_top: 0,
            is_show: 0,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
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
