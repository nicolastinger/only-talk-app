use crate::dao::friend_db::{query_friend_info_by_id_db, query_friend_info_db};
use crate::service::friend_service::{delete_friend, search_friend_list, update_friend_list};
use crate::service::user_service::get_user_info;
use crate::vo::friend_vo::FriendVo;

/// 查询好友列表
#[tauri::command]
pub async fn get_friend_list() -> Result<Vec<FriendVo>, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let friends = query_friend_info_db(&me).await.map_err(|e| e.to_string())?;
    let mut friend_vec = vec![];
    for friend in friends {
        let friend_vo = FriendVo::from(friend);
        friend_vec.push(friend_vo);
    }
    Ok(friend_vec)
}

/// 查询当前好友信息
#[tauri::command]
pub async fn get_friend_info(friend_uuid: String) -> Result<FriendVo, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let friend = query_friend_info_by_id_db(&me, &friend_uuid).await.map_err(|e| e.to_string())?;
    let friend_vo = FriendVo::from(friend);
    Ok(friend_vo)
}

/// 更新本地好友列表
#[tauri::command]
pub async fn update_local_friend_list() -> Result<(), String> {
    update_friend_list().await.map_err(|e| e.to_string())?;
    Ok(())
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
