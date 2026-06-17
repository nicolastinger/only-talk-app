use log::error;

use crate::dao::get_db_client;
use crate::entity::friend::Friend;

/// 获取好友信息表
pub async fn query_friend_info_db(uuid: &str) -> Result<Vec<Friend>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record =
        sqlx::query_as::<_, Friend>(r#"select * from friend where me = ?1 and is_del = 0"#)
            .bind(uuid)
            .fetch_all(&pool_sqlite)
            .await?;
    Ok(record)
}

/// 获取单条好友信息
pub async fn query_friend_info_by_id_db(
    uuid: &str,
    friend_id: &str,
) -> Result<Friend, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, Friend>(
        r#"select * from friend where me = ?1 and friend_id = ?2 limit 1"#,
    )
    .bind(uuid)
    .bind(friend_id)
    .fetch_one(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 软删除好友（设置is_del为true，is_show为0）
pub async fn soft_delete_friend_db(me: &str, friend_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"UPDATE friend SET is_del = 1, is_show = 0, updated_at = ?1 WHERE me = ?2 AND friend_id = ?3"#,
    )
    .bind(now)
    .bind(me)
    .bind(friend_id)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 模糊搜索好友（按好友名称、好友账号搜索）
pub async fn search_friend_db(
    uuid: &str,
    keyword: &str,
) -> Result<Vec<Friend>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let pattern = format!("%{}%", keyword);
    let record = sqlx::query_as::<_, Friend>(
        r#"select * from friend where me = ?1 and is_del = 0 and is_block = 0 and (friend_name LIKE ?2 or friend_account LIKE ?2)"#,
    )
    .bind(uuid)
    .bind(&pattern)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 更新好友信息表
pub async fn update_friend_info_db(friend: &Friend) -> Result<(), anyhow::Error> {
    let res = sqlx::query(r#"UPDATE friend SET friend_id = ?1, friend_account = ?2, friend_name = ?3, friend_icon = ?4, friend_status = ?5, me = ?6, is_del = ?7, is_block = ?8, is_mute = ?9, is_top = ?10, is_show = ?11, created_at = ?12, updated_at = ?13, version = ?14, friend_info = ?15 WHERE friend_id = ?1 and me = ?6"#)
        .bind(&friend.friend_id)
        .bind(&friend.friend_account)
        .bind(&friend.friend_name)
        .bind(&friend.friend_icon)
        .bind(friend.friend_status)
        .bind(&friend.me)
        .bind(friend.is_del)
        .bind(friend.is_block)
        .bind(friend.is_mute)
        .bind(friend.is_top)
        .bind(friend.is_show)
        .bind(friend.created_at)
        .bind(friend.updated_at)
        .bind(friend.version)
        .bind(&friend.friend_info)
        .execute(&get_db_client().await?)
        .await;
    if res?.rows_affected() < 1 {
        // 如果更新失败，则插入新的好友信息
        let res = sqlx::query(r#"INSERT INTO friend (friend_id, friend_account, friend_name, friend_icon, friend_status, me, is_del, is_block, is_mute, is_top, is_show, created_at, updated_at, version, friend_info) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"#)
            .bind(&friend.friend_id)
            .bind(&friend.friend_account)
            .bind(&friend.friend_name)
            .bind(&friend.friend_icon)
            .bind(friend.friend_status)
            .bind(&friend.me)
            .bind(friend.is_del)
            .bind(friend.is_block)
            .bind(friend.is_mute)
            .bind(friend.is_top)
            .bind(friend.is_show)
            .bind(friend.created_at)
            .bind(friend.updated_at)
            .bind(friend.version)
            .bind(&friend.friend_info)
            .execute(&get_db_client().await?)
            .await;
        if let Err(e) = res {
            error!("更新好友信息表失败 {:?}", e);
        }
    }
    Ok(())
}
