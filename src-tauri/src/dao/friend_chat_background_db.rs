use crate::dao::get_db_client;
use crate::models::entity::friend_chat_background::FriendChatBackground;
use crate::utils::time::get_now_time_stamp_as_millis;

/// 写入/替换某好友的专属背景, 返回被替换掉的旧文件名(供上层删除旧文件)。
pub async fn upsert(friend_uuid: &str, file_name: &str) -> Result<Option<String>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let now = get_now_time_stamp_as_millis()?;
    let previous: Option<String> =
        sqlx::query_scalar("SELECT file_name FROM friend_chat_background WHERE friend_uuid = ?1")
            .bind(friend_uuid)
            .fetch_optional(&pool_sqlite)
            .await?;
    sqlx::query(
        r#"INSERT INTO friend_chat_background (friend_uuid, file_name, created_at)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(friend_uuid) DO UPDATE SET
               file_name  = excluded.file_name,
               created_at = excluded.created_at"#,
    )
    .bind(friend_uuid)
    .bind(file_name)
    .bind(now)
    .execute(&pool_sqlite)
    .await?;
    Ok(previous)
}

/// 查询某好友的专属背景。
pub async fn get(friend_uuid: &str) -> Result<Option<FriendChatBackground>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let row = sqlx::query_as::<_, FriendChatBackground>(
        "SELECT * FROM friend_chat_background WHERE friend_uuid = ?1",
    )
    .bind(friend_uuid)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(row)
}

/// 删除某好友的专属背景, 返回被删除的文件名(供上层删除磁盘文件)。
pub async fn delete(friend_uuid: &str) -> Result<Option<String>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let file_name: Option<String> =
        sqlx::query_scalar("SELECT file_name FROM friend_chat_background WHERE friend_uuid = ?1")
            .bind(friend_uuid)
            .fetch_optional(&pool_sqlite)
            .await?;
    if file_name.is_some() {
        sqlx::query("DELETE FROM friend_chat_background WHERE friend_uuid = ?1")
            .bind(friend_uuid)
            .execute(&pool_sqlite)
            .await?;
    }
    Ok(file_name)
}
