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
