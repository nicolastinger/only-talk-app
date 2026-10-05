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
        r#"SELECT * from(SELECT nano_id, text_type, raw, group_id as recv_user, send_user, timestamp FROM group_chat_record WHERE group_id = ?1 AND deleted = 0 order by timestamp desc limit ?2 offset ?3) order by timestamp asc"#
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

/// 本机软删除群聊消息：deleted 置 1
pub async fn delete_group_chat_record_db(
    nano_ids: &[String],
    group_id: &str,
) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let mut tx = pool_sqlite.begin().await?;
    for nano_id in nano_ids {
        sqlx::query(
            r#"UPDATE group_chat_record SET deleted = 1 WHERE nano_id = ?1 AND group_id = ?2"#,
        )
        .bind(nano_id)
        .bind(group_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
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

/// 已读上报推进校验: 按 nano_id 查本地聊天记录表中该消息的时间戳。
///
/// 推进是否合法以**聊天记录表的时间戳**为准(而非水位表记录), 跨端回填等场景下
/// 水位可能被推到历史位置, 只有聊天记录表里的消息时间戳才是消息本身的先后顺序。
pub async fn group_chat_record_timestamp_by_nano_id(
    nano_id: &str,
) -> Result<Option<i64>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let row: Option<(i64,)> =
        sqlx::query_as(r#"SELECT timestamp FROM group_chat_record WHERE nano_id = ?1"#)
            .bind(nano_id)
            .fetch_optional(&pool_sqlite)
            .await?;
    Ok(row.map(|r| r.0))
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
