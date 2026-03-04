use crate::dao::{get_private_db_client};
use crate::entity::chat_record_ack::ChatRecordAck;
use crate::vo::text_quic_msg::TextQuicMsgVo;

/// 添加本地ack信息
pub async fn insert_chat_record_ack(chat_record_ack: &ChatRecordAck) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"INSERT INTO chat_record_ack (msg_id, prev_id, send_id, platform, ack_status, recv_user, send_user, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#)
        .bind(&chat_record_ack.msg_id)
        .bind(&chat_record_ack.prev_id)
        .bind(&chat_record_ack.send_id)
        .bind(&chat_record_ack.platform)
        .bind(&chat_record_ack.ack_status)
        .bind(&chat_record_ack.recv_user)
        .bind(&chat_record_ack.send_user)
        .bind(&chat_record_ack.timestamp)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 查询ack表中是否存在某条信息
pub async fn query_ack_record_from_db(nanoid: &str) -> Result<TextQuicMsgVo, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record =
        sqlx::query_as::<_, TextQuicMsgVo>(r#"SELECT * FROM chat_record_ack WHERE send_id = ?1"#)
            .bind(nanoid)
            .fetch_one(&pool_sqlite)
            .await?;
    Ok(record)
}

/// 通过send_id获取消息
pub async fn query_chat_record_by_send_id(send_id: &str, recv_user: &str, ) -> Result<ChatRecordAck, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record =
        sqlx::query_as::<_, ChatRecordAck>(r#"SELECT * FROM chat_record_ack WHERE send_id = ?1 and recv_user = ?2"#)
            .bind(send_id)
            .bind(recv_user)
            .fetch_one(&pool_sqlite)
            .await?;
    Ok(record)
}

/// 更新ack表中某条信息为已确认
pub async fn update_chat_record_ack(send_id: &str, ack_status: u16, mag_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"UPDATE chat_record_ack SET ack_status = ?1, msg_id = ?2 WHERE send_id = ?3"#)
        .bind(ack_status)
        .bind(mag_id)
        .bind(send_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

// 更新prev_id
pub async fn update_chat_record_ack_prev_id(send_id: &str, prev_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"UPDATE chat_record_ack SET prev_id = ?1 WHERE send_id = ?2"#)
        .bind(prev_id)
        .bind(send_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}