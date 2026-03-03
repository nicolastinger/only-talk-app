use crate::dao::get_private_db_client;
use crate::entity::chat_record_send::ChatRecordSend;

/// 插入一条发送记录
pub async fn insert_chat_record_send(chat_record_send: &ChatRecordSend) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"INSERT INTO chat_record_send (send_id, msg_id, platform, recv_user, send_user, timestamp, raw, send_status, retry_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#)
        .bind(&chat_record_send.send_id)
        .bind(&chat_record_send.msg_id)
        .bind(&chat_record_send.platform)
        .bind(&chat_record_send.recv_user)
        .bind(&chat_record_send.send_user)
        .bind(chat_record_send.timestamp)
        .bind(&chat_record_send.raw)
        .bind(chat_record_send.send_status)
        .bind(chat_record_send.retry_count)
        .fetch_optional(&pool_sqlite)
        .await?;
    Ok(())
}

// 根据用户id和接收用户id查询发送记录
pub async fn query_chat_record_send_by_user(uuid: &str, recv_user: &str, send_status: Vec<u16>) -> Result<Vec<ChatRecordSend>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    
    // 动态生成 IN 子句的占位符
    let placeholders = send_status.iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 3))
        .collect::<Vec<_>>()
        .join(", ");
    
    let query = format!(
        "SELECT * FROM chat_record_send WHERE send_user = ?1 AND recv_user = ?2 AND send_status IN ({})",
        placeholders
    );
    
    let mut query_builder = sqlx::query_as::<_, ChatRecordSend>(&query)
        .bind(uuid)
        .bind(recv_user);
    
    for status in &send_status {
        query_builder = query_builder.bind(*status);
    }
    
    let record = query_builder.fetch_all(&pool_sqlite).await?;
    Ok(record)
}

