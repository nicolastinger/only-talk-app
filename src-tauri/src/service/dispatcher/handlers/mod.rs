//! 各消息类型的业务 handler。路由见 `super::dispatch`。

pub(super) mod ack;
pub(super) mod call_control;
pub(super) mod force_logout;
pub(super) mod group_chat;
pub(super) mod ping;
pub(super) mod private_chat;
pub(super) mod recall;
pub(super) mod session_update;
pub(super) mod system;
pub(super) mod webrtc;

/// 目标会话是否为群聊(供 ack 落库时判定会话类型)。
async fn is_group_message(recv_user: &str) -> bool {
    crate::models::entity::group::Group::query_by_group_id(recv_user)
        .await
        .map(|g| g.is_some())
        .unwrap_or(false)
}
