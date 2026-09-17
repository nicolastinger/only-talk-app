use crate::dao::get_private_db_client;
use crate::entity::group_chat_record::GroupChatRecord;
use crate::vo::text_quic_msg::TextQuicMsgVo;

pub async fn insert_group_chat_record(record: &GroupChatRecord) -> Result<(), anyhow::Error> {
    GroupChatRecord::insert(record).await.map(|_| ())
}

pub async fn query_group_chat_record_from_db(
    group_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let records = sqlx::query_as::<_, TextQuicMsgVo>(
        r#"SELECT * from(SELECT nano_id, text_type, raw, group_id as recv_user, send_user, timestamp FROM group_chat_record WHERE group_id = ?1 order by timestamp desc limit ?2 offset ?3) order by timestamp asc"#
    )
    .bind(group_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(records)
}

pub async fn query_last_group_chat_record(
    group_id: &str,
) -> Result<Option<GroupChatRecord>, anyhow::Error> {
    GroupChatRecord::query_last_record(group_id).await
}

/// 任务07: 同步落库后回填服务端消息 id。
pub async fn set_group_server_id(nano_id: &str, server_id: i64) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query("UPDATE group_chat_record SET server_id = ?1 WHERE nano_id = ?2")
        .bind(server_id)
        .bind(nano_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 任务07: 群会话本地已同步的最大服务端 id(已读上报用); 无则 None。
pub async fn local_max_group_server_id(group_id: &str) -> Result<Option<i64>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let (max,): (Option<i64>,) =
        sqlx::query_as("SELECT MAX(server_id) FROM group_chat_record WHERE group_id = ?1")
            .bind(group_id)
            .fetch_one(&pool_sqlite)
            .await?;
    Ok(max)
}
