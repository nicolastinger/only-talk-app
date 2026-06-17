use crate::service::chat_service::{
    create_group_chat_session_service, get_group_chat_session_service,
};
use crate::service::group_service::{
    accept_group_invitation, create_group, decline_group_invitation, get_group_info,
    get_local_group_list, get_local_group_members, invite_group_members, join_group, leave_group,
    remove_group_member_service, search_local_group_list, sync_group_list, sync_group_members,
};
use crate::vo::group_vo::{CreateGroupRequest, GroupMemberVo, GroupVo};

/// 获取本地群聊列表
#[tauri::command]
pub async fn get_group_list() -> Result<Vec<GroupVo>, String> {
    get_local_group_list().await.map_err(|e| e.to_string())
}

/// 获取群成员列表
#[tauri::command]
pub async fn get_group_members(group_id: String) -> Result<Vec<GroupMemberVo>, String> {
    get_local_group_members(&group_id).await.map_err(|e| e.to_string())
}

/// 获取群详情
#[tauri::command]
pub async fn get_group_info_command(group_id: String) -> Result<GroupVo, String> {
    get_group_info(&group_id).await.map_err(|e| e.to_string())
}

/// 创建群聊
#[tauri::command]
pub async fn create_group_command(request: CreateGroupRequest) -> Result<GroupVo, String> {
    create_group(request).await.map_err(|e| e.to_string())
}

/// 邀请群成员（发送邀请通知）
#[tauri::command]
pub async fn invite_group_members_command(
    group_id: String,
    user_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    invite_group_members(&group_id, user_ids).await.map_err(|e| e.to_string())
}

/// 接受群邀请
#[tauri::command]
pub async fn accept_group_invitation_command(group_id: String) -> Result<(), String> {
    accept_group_invitation(&group_id).await.map_err(|e| e.to_string())
}

/// 拒绝群邀请
#[tauri::command]
pub async fn decline_group_invitation_command(group_id: String) -> Result<(), String> {
    decline_group_invitation(&group_id).await.map_err(|e| e.to_string())
}

/// 加入群聊（已废弃，改为 accept_group_invitation_command）
#[tauri::command]
pub async fn join_group_command(group_id: String) -> Result<(), String> {
    join_group(&group_id).await.map_err(|e| e.to_string())
}

/// 离开群聊
#[tauri::command]
pub async fn leave_group_command(group_id: String) -> Result<(), String> {
    leave_group(&group_id).await.map_err(|e| e.to_string())
}

/// 移除群成员
#[tauri::command]
pub async fn remove_group_member_command(group_id: String, user_id: String) -> Result<(), String> {
    remove_group_member_service(&group_id, &user_id).await.map_err(|e| e.to_string())
}

/// 从服务器同步群聊列表
#[tauri::command]
pub async fn sync_group_list_command() -> Result<(), String> {
    sync_group_list().await.map_err(|e| e.to_string())
}

/// 从服务器同步群成员列表
#[tauri::command]
pub async fn sync_group_members_command(group_id: String) -> Result<Vec<GroupMemberVo>, String> {
    sync_group_members(&group_id).await.map_err(|e| e.to_string())
}

/// 创建群聊会话
#[tauri::command]
pub async fn create_group_chat_session_command(group_id: String) -> Result<(), String> {
    create_group_chat_session_service(group_id).await.map_err(|e| e.to_string())
}

/// 获取群聊会话列表
#[tauri::command]
pub async fn get_group_chat_session_list(
) -> Result<Vec<crate::vo::chat_session_vo::ChatSessionVo>, String> {
    get_group_chat_session_service().await.map_err(|e| e.to_string())
}

/// 模糊搜索群聊列表
#[tauri::command]
pub async fn search_group(keyword: String) -> Result<Vec<GroupVo>, String> {
    search_local_group_list(keyword).await.map_err(|e| e.to_string())
}
