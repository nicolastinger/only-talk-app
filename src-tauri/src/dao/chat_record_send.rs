use crate::dao::get_private_db_client;
use crate::entity::chat_record_send::ChatRecordSend;

/// 插入一条发送记录
pub async fn insert_chat_record_send(chat_record_send: &ChatRecordSend) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"INSERT INTO chat_record_send (send_id, msg_id, text_type, platform, recv_user, send_user, timestamp, raw, send_status, retry_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#)
        .bind(&chat_record_send.send_id)
        .bind(&chat_record_send.msg_id)
        .bind(chat_record_send.text_type)
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

// 标记消息已发送完成
pub async fn update_chat_record_send_success(send_id: &str, msg_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"UPDATE chat_record_send SET send_status = 3, msg_id = ?1 WHERE send_id = ?2"#)
        .bind(msg_id)
        .bind(send_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

// 更新发送消息
pub async fn update_chat_record_send(send_id: &str, msg_id: &str, send_status: u16, retry_count: i32, timestamp: i64) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    sqlx::query(r#"UPDATE chat_record_send SET send_status = ?1, msg_id = ?2, retry_count = ?3, timestamp = ?4 WHERE send_id = ?5"#)
        .bind(send_status)
        .bind(msg_id)
        .bind(retry_count)
        .bind(timestamp)
        .bind(send_id)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

// 根据用户id和接收用户id查询发送记录
pub async fn query_chat_record_send_by_user(uuid: &str, recv_user: &str, send_status: Vec<u16>, asc: bool) -> Result<Vec<ChatRecordSend>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    
    // 动态生成 IN 子句的占位符
    let placeholders = send_status.iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 3))
        .collect::<Vec<_>>()
        .join(", ");

    let order_by = if asc { "ASC" } else { "DESC" };
    
    let query = format!(
        "SELECT * FROM chat_record_send WHERE send_user = ?1 AND (recv_user = ?2 or ?2 = '') AND send_status IN ({}) ORDER BY id {}",
        placeholders,
        order_by
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


/// 查询ack表中是否存在某条信息
pub async fn query_record_send_from_db(send_id: &str) -> Result<ChatRecordSend, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record =
        sqlx::query_as::<_, ChatRecordSend>(r#"SELECT * FROM chat_record_send WHERE send_id = ?1"#)
            .bind(send_id)
            .fetch_one(&pool_sqlite)
            .await?;
    Ok(record)
}
