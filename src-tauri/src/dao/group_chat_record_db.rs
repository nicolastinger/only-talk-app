use crate::dao::get_private_db_client;
use crate::entity::group_chat_record::GroupChatRecord;
use crate::vo::text_quic_msg::TextQuicMsgVo;

pub async fn insert_group_chat_record(record: &GroupChatRecord) -> Result<(), anyhow::Error> {
    GroupChatRecord::insert(record).await
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
