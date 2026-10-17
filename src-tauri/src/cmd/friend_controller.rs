use crate::models::vo::friend_vo::{BlackListVo, FriendVo};
use crate::service::friend_service::{
    block_friend, delete_friend, get_black_list as get_black_list_service,
    get_friend_info as get_friend_info_service, get_friend_list as get_friend_list_service,
    search_friend_list, unblock_friend, update_friend_list,
    update_friend_profile as update_friend_profile_service,
};

/// 查询好友列表
#[tauri::command]
pub async fn get_friend_list() -> Result<Vec<FriendVo>, String> {
    get_friend_list_service().await.map_err(|e| e.to_string())
}

/// 查询当前好友信息
#[tauri::command]
pub async fn get_friend_info(friend_uuid: String) -> Result<FriendVo, String> {
    get_friend_info_service(&friend_uuid).await.map_err(|e| e.to_string())
}

/// 更新本地好友列表
#[tauri::command]
pub async fn update_local_friend_list() -> Result<(), String> {
    update_friend_list().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 用已从 HTTP 拉取到的好友资料定向回写本地好友表(sqlite 单条更新)
#[tauri::command]
pub async fn update_friend_profile_command(
    friend_uuid: String,
    account: String,
    name: String,
    icon: String,
    info: String,
) -> Result<(), String> {
    update_friend_profile_service(&friend_uuid, &account, &name, &icon, &info)
        .await
        .map_err(|e| e.to_string())
}

/// 删除好友（软删除）
#[tauri::command]
pub async fn delete_friend_command(friend_uuid: String) -> Result<(), String> {
    delete_friend(&friend_uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 模糊搜索好友列表
#[tauri::command]
pub async fn search_friend(keyword: String) -> Result<Vec<FriendVo>, String> {
    search_friend_list(keyword).await.map_err(|e| e.to_string())
}

/// 拉黑好友
#[tauri::command]
pub async fn block_friend_command(friend_uuid: String) -> Result<(), String> {
    block_friend(&friend_uuid).await.map_err(|e| e.to_string())
}

/// 取消拉黑好友
#[tauri::command]
pub async fn unblock_friend_command(friend_uuid: String) -> Result<(), String> {
    unblock_friend(&friend_uuid).await.map_err(|e| e.to_string())
}

/// 查询黑名单列表
#[tauri::command]
pub async fn get_black_list() -> Result<Vec<BlackListVo>, String> {
    get_black_list_service().await.map_err(|e| e.to_string())
}
