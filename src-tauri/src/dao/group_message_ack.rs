use crate::dao::get_private_db_client;
use crate::entity::group_message_ack::GroupMessageAck;

/// 插入群消息 ack 记录
pub async fn insert_group_message_ack(ack: &GroupMessageAck) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(
        r#"INSERT INTO group_message_ack (nano_id, group_uuid, send_user, ack_status, timestamp) 
           VALUES (?1, ?2, ?3, ?4, ?5)"#,
    )
    .bind(&ack.nano_id)
    .bind(&ack.group_uuid)
    .bind(&ack.send_user)
    .bind(&ack.ack_status)
    .bind(&ack.timestamp)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 根据 nano_id 查询群消息 ack
pub async fn query_group_message_ack_by_nano_id(nano_id: &str) -> Result<Option<GroupMessageAck>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record = sqlx::query_as::<_, GroupMessageAck>(
        r#"SELECT * FROM group_message_ack WHERE nano_id = ?1"#,
    )
    .bind(nano_id)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 更新群消息 ack 状态
pub async fn update_group_message_ack_status(nano_id: &str, ack_status: u16) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(
        r#"UPDATE group_message_ack SET ack_status = ?1 WHERE nano_id = ?2"#,
    )
    .bind(ack_status)
    .bind(nano_id)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 查询未确认的群消息 ack
pub async fn query_pending_group_message_acks(group_uuid: &str) -> Result<Vec<GroupMessageAck>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let records = sqlx::query_as::<_, GroupMessageAck>(
        r#"SELECT * FROM group_message_ack WHERE group_uuid = ?1 AND ack_status = 0"#,
    )
    .bind(group_uuid)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(records)
}