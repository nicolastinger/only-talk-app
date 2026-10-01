use crate::dao::get_private_db_client;
use crate::entity::group_message_read::GroupMessageRead;

pub async fn update_group_message_read(record: &GroupMessageRead) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let update_res = sqlx::query(
        r#"UPDATE group_message_read SET nano_id = ?1, timestamp = ?2 WHERE group_uuid = ?3 AND user_uuid = ?4"#,
    )
    .bind(&record.nano_id)
    .bind(record.timestamp)
    .bind(&record.group_uuid)
    .bind(&record.user_uuid)
    .execute(&pool_sqlite)
    .await;

    if update_res?.rows_affected() < 1 {
        sqlx::query(
            r#"INSERT INTO group_message_read (nano_id, timestamp, group_uuid, user_uuid) VALUES (?1, ?2, ?3, ?4)"#,
        )
        .bind(&record.nano_id)
        .bind(record.timestamp)
        .bind(&record.group_uuid)
        .bind(&record.user_uuid)
        .execute(&pool_sqlite)
        .await?;
    }
    Ok(())
}

pub async fn query_group_message_read(
    group_uuid: &str,
    user_uuid: &str,
) -> Result<Option<GroupMessageRead>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record = sqlx::query_as::<_, GroupMessageRead>(
        r#"SELECT * FROM group_message_read WHERE group_uuid = ?1 AND user_uuid = ?2"#,
    )
    .bind(group_uuid)
    .bind(user_uuid)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 上次成功上报到服务端的已读游标(未上报过为 0)。
pub async fn group_read_reported_server_id(
    group_uuid: &str,
    user_uuid: &str,
) -> Result<i64, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let row: Option<(i64,)> = sqlx::query_as(
        r#"SELECT reported_server_id FROM group_message_read WHERE group_uuid = ?1 AND user_uuid = ?2"#,
    )
    .bind(group_uuid)
    .bind(user_uuid)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(row.map(|r| r.0).unwrap_or(0))
}

/// 推进已读上报游标(只前进, 与服务端 update_last_read_id 同语义)。
pub async fn update_group_reported_server_id(
    group_uuid: &str,
    user_uuid: &str,
    reported_server_id: i64,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(
        r#"UPDATE group_message_read SET reported_server_id = ?1 WHERE group_uuid = ?2 AND user_uuid = ?3 AND reported_server_id < ?1"#,
    )
    .bind(reported_server_id)
    .bind(group_uuid)
    .bind(user_uuid)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 跨端已读上报: 群已读水位 nano_id 对应的服务端 id(水位即已读位置, 而非本地 max)。
pub async fn group_read_watermark_server_id(
    group_uuid: &str,
    user_uuid: &str,
) -> Result<Option<i64>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT nano_id FROM group_message_read WHERE group_uuid = ?1 AND user_uuid = ?2"#,
    )
    .bind(group_uuid)
    .bind(user_uuid)
    .fetch_optional(&pool_sqlite)
    .await?;
    let Some((nano_id,)) = row else { return Ok(None) };
    let row: Option<(i64,)> = sqlx::query_as(
        r#"SELECT server_id FROM group_chat_record WHERE nano_id = ?1 AND server_id IS NOT NULL"#,
    )
    .bind(nano_id)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(row.map(|r| r.0))
}

/// 获取群聊已读消息（定时任务上报用）
pub async fn query_group_last_read_msg(
    uuid: &str,
    timestamp: i64,
) -> Result<Vec<GroupMessageRead>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record = sqlx::query_as::<_, GroupMessageRead>(
        r#"select * from group_message_read where user_uuid = ?1 and timestamp > ?2"#,
    )
    .bind(uuid)
    .bind(timestamp)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 任务07: 自 watermark 起有阅读事件的群及各自最大事件时间(已读上报聚合用)。
pub async fn query_group_read_peers(
    uuid: &str,
    timestamp: i64,
) -> Result<Vec<(String, i64)>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let rows = sqlx::query_as::<_, (String, i64)>(
        r#"SELECT group_uuid AS g, MAX(timestamp) AS ts FROM group_message_read WHERE user_uuid = ?1 AND timestamp > ?2 GROUP BY group_uuid"#,
    )
    .bind(uuid)
    .bind(timestamp)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(rows)
}
