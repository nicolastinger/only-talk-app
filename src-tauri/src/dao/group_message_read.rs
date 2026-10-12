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

/// 已读上报推进状态: 上次成功上报到服务端的已读位置(未上报过返回空串 + 0)。
///
/// `(nano_id, timestamp)`: nano_id 即上报内容, timestamp 用于"只推时间戳更新位置"的推进校验。
pub async fn group_read_reported_position(
    group_uuid: &str,
    user_uuid: &str,
) -> Result<(String, i64), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let row: Option<(String, i64)> = sqlx::query_as(
        r#"SELECT reported_nano_id, reported_timestamp FROM group_message_read WHERE group_uuid = ?1 AND user_uuid = ?2"#,
    )
    .bind(group_uuid)
    .bind(user_uuid)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(row.unwrap_or((String::new(), 0)))
}

/// 推进已读上报位置: 上报成功后记录 nano_id 与对应时间戳。
///
/// 只允许推进到时间戳更新的位置(调用方已用 `timestamp > last_reported.timestamp` 把关)。
pub async fn update_group_reported_position(
    group_uuid: &str,
    user_uuid: &str,
    reported_nano_id: &str,
    reported_timestamp: i64,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(
        r#"UPDATE group_message_read SET reported_nano_id = ?1, reported_timestamp = ?2 WHERE group_uuid = ?3 AND user_uuid = ?4"#,
    )
    .bind(reported_nano_id)
    .bind(reported_timestamp)
    .bind(group_uuid)
    .bind(user_uuid)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 已读上报: 当前已读水位的 nano_id(水位即已读位置)。
///
/// 客户端只上报 nano_id, 不做本地数值换算 —— 服务端按会话类型反查自己的消息 id 推进。
/// 推进校验的时间戳不在水位表取, 而是按 nano_id 回查本地聊天记录表(`group_chat_record`)。
pub async fn group_read_watermark_nano_id(
    group_uuid: &str,
    user_uuid: &str,
) -> Result<Option<String>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT nano_id FROM group_message_read WHERE group_uuid = ?1 AND user_uuid = ?2"#,
    )
    .bind(group_uuid)
    .bind(user_uuid)
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
