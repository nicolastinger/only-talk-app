use crate::dao::get_db_client;
use crate::entity::chat_record_read::ChatRecordRead;

/// 更新已读消息
pub async fn update_last_read_msg(chat_record_read: &ChatRecordRead) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let update_res = sqlx::query(r#"UPDATE chat_record_read SET nano_id = ?1, timestamp = ?2, send_user = ?3, recv_user = ?4 WHERE send_user = ?3 and recv_user = ?4"#)
        .bind(&chat_record_read.nano_id)
        .bind(chat_record_read.timestamp)
        .bind(&chat_record_read.send_user)
        .bind(&chat_record_read.recv_user)
        .execute(&pool_sqlite)
        .await;
    if update_res?.rows_affected() < 1 {
        sqlx::query(r#"INSERT INTO chat_record_read (nano_id, timestamp, send_user, recv_user) VALUES (?1, ?2, ?3, ?4)"#)
            .bind(&chat_record_read.nano_id)
            .bind(chat_record_read.timestamp)
            .bind(&chat_record_read.send_user)
            .bind(&chat_record_read.recv_user)
            .execute(&pool_sqlite)
            .await?;
    }
    Ok(())
}

/// 读取单聊对端当前的已读水位行(无则 None)。跨端已读回填时用于判断是否需要推进。
pub async fn query_read_watermark(
    me: &str,
    peer: &str,
) -> Result<Option<ChatRecordRead>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatRecordRead>(
        r#"SELECT * FROM chat_record_read WHERE recv_user = ?1 AND send_user = ?2"#,
    )
    .bind(me)
    .bind(peer)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 已读上报推进状态: 上次成功上报到服务端的已读位置(未上报过返回空串 + 0)。
///
/// `(nano_id, timestamp)`: nano_id 即上报内容, timestamp 用于"只推时间戳更新位置"的推进校验。
pub async fn read_reported_position(me: &str, peer: &str) -> Result<(String, i64), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let row: Option<(String, i64)> = sqlx::query_as(
        r#"SELECT reported_nano_id, reported_timestamp FROM chat_record_read WHERE recv_user = ?1 AND send_user = ?2"#,
    )
    .bind(me)
    .bind(peer)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(row.unwrap_or((String::new(), 0)))
}

/// 推进已读上报位置: 上报成功后记录 nano_id 与对应时间戳。
///
/// 只允许推进到时间戳更新的位置(调用方已用 `timestamp > last_reported.timestamp` 把关)。
pub async fn update_reported_position(
    me: &str,
    peer: &str,
    reported_nano_id: &str,
    reported_timestamp: i64,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(
        r#"UPDATE chat_record_read SET reported_nano_id = ?1, reported_timestamp = ?2 WHERE recv_user = ?3 AND send_user = ?4"#,
    )
    .bind(reported_nano_id)
    .bind(reported_timestamp)
    .bind(me)
    .bind(peer)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 已读上报: 当前已读水位的 nano_id(水位即已读位置)。
///
/// 客户端只上报 nano_id, 不做本地数值换算 —— 服务端按会话类型反查自己的消息 id 推进。
/// 推进校验的时间戳不在水位表取, 而是按 nano_id 回查本地聊天记录表(`chat_record`)。
pub async fn read_watermark_nano_id(me: &str, peer: &str) -> Result<Option<String>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT nano_id FROM chat_record_read WHERE recv_user = ?1 AND send_user = ?2"#,
    )
    .bind(me)
    .bind(peer)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(row.map(|r| r.0))
}
