use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::entity::user::SignInResult;
use crate::vo::friend_vo::FriendListVO;

/// 用户聚合根
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserAggregate {
    /// 用户唯一标识
    pub uuid: String,
    /// 用户账号
    pub account: String,
    /// 用户昵称
    pub username: String,
    /// 用户头像
    pub icon: String,
    /// 用户信息
    pub info: String,
    /// 用户好友列表
    pub friends: Vec<FriendListVO>,
    /// 用户会话列表
    pub sessions: Vec<String>,
    /// 用户认证令牌
    pub token: String,
    /// 其他用户属性
    pub attributes: HashMap<String, String>,
}

impl UserAggregate {
    /// 创建新的用户聚合根
    pub fn new(
        uuid: String,
        account: String,
        username: String,
        icon: String,
        info: String,
        token: String,
    ) -> Self {
        Self {
            uuid,
            account,
            username,
            icon,
            info,
            friends: Vec::new(),
            sessions: Vec::new(),
            token,
            attributes: HashMap::new(),
        }
    }

    /// 根据登录结果更新用户信息
    pub fn update_from_sign_in_result(&mut self, sign_in_result: &SignInResult) {
        self.token = sign_in_result.data.clone();
    }

    /// 添加好友到用户聚合根
    pub fn add_friend(&mut self, friend: FriendListVO) {
        self.friends.push(friend);
    }

    /// 获取好友列表
    pub fn get_friends(&self) -> &Vec<FriendListVO> {
        &self.friends
    }

    /// 添加会话
    pub fn add_session(&mut self, session_id: String) {
        self.sessions.push(session_id);
    }

    /// 获取会话列表
    pub fn get_sessions(&self) -> &Vec<String> {
        &self.sessions
    }

    /// 设置用户属性
    pub fn set_attribute(&mut self, key: String, value: String) {
        self.attributes.insert(key, value);
    }

    /// 获取用户属性
    pub fn get_attribute(&self, key: &str) -> Option<&String> {
        self.attributes.get(key)
    }
}