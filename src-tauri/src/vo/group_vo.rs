use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroupVo {
    pub group_uuid: String,
    pub group_name: String,
    pub avatar: Option<String>,
    pub owner_uuid: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub max_members: i32,
    pub member_count: i64,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub status: i16,
    #[serde(default)]
    pub last_msg_time: Option<i64>,
    #[serde(default)]
    pub unread_count: i64,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateGroupApiRequest {
    pub group_name: String,
    pub avatar: Option<String>,
    pub max_members: Option<i32>,
}