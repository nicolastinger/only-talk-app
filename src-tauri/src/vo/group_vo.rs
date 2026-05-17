use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroupVo {
    pub group_id: String,
    pub group_name: String,
    pub group_icon: String,
    pub owner_id: String,
    pub created_at: i64,
    pub member_count: i64,
    pub version: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroupMemberVo {
    pub group_id: String,
    pub user_id: String,
    pub username: String,
    pub icon: String,
    pub role: i64,
    pub nickname: String,
    pub joined_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateGroupRequest {
    pub group_name: String,
    pub group_icon: String,
    pub member_ids: Vec<String>,
}
