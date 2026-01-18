// 本地聊天记录sql

use crate::entity::chat_record_read::ChatRecordRead;
use crate::entity::Page;
use crate::dao::get_db_client;
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::GLOBAL_SQL_POOL;
use anyhow::anyhow;

/// 分页获取聊天记录
pub async fn query_chat_record_from_db(
    text_quic_msg: TextQuicMsgVo,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, TextQuicMsgVo>(r#"SELECT * FROM chat_record WHERE (send_user = ?1 and recv_user = ?2) OR (send_user = ?2 and recv_user = ?1) order by timestamp"#)
        .bind(text_quic_msg.send_user)
        .bind(text_quic_msg.recv_user)
        .fetch_all(&pool_sqlite)
        .await?;
    Ok(record)
}

/// 根据id获取聊天记录
pub async fn query_chat_record_by_id_from_db(
    id: &str,
    uuid: &str,
) -> Result<TextQuicMsgVo, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, TextQuicMsgVo>(
        r#"SELECT * FROM chat_record WHERE nano_id = ? and (send_user = ? OR recv_user = ?)"#,
    )
    .bind(id)
    .bind(uuid)
    .bind(uuid)
    .fetch_one(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 插入聊天记录
pub async fn insert_chat_record(text_quic_msg: &TextQuicMsgVo) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(r#"INSERT INTO chat_record (nano_id, raw, timestamp, send_user, recv_user, text_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#)
        .bind(&text_quic_msg.nano_id)
        .bind(&text_quic_msg.raw)
        .bind(text_quic_msg.timestamp)
        .bind(&text_quic_msg.send_user)
        .bind(&text_quic_msg.recv_user)
        .bind(text_quic_msg.text_type)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 获取已读消息
pub async fn query_last_read_msg(
    uuid: &str,
    timestamp: i64,
) -> Result<Vec<ChatRecordRead>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatRecordRead>(
        r#"select * from chat_record_read where recv_user = ?1 and timestamp > ?2"#,
    )
    .bind(uuid)
    .bind(timestamp)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(record)
}

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

/// 添加本地ack信息
pub async fn insert_local_ack_to_db(text_quic_msg: TextQuicMsgVo) -> Result<(), anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    sqlx::query(r#"INSERT INTO chat_record_ack (nano_id, raw, timestamp, send_user, recv_user, text_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#)
        .bind(&text_quic_msg.nano_id)
        .bind(&text_quic_msg.raw)
        .bind(text_quic_msg.timestamp)
        .bind(&text_quic_msg.send_user)
        .bind(&text_quic_msg.recv_user)
        .bind(text_quic_msg.text_type)
        .execute(pool_sqlite)
        .await?;
    Ok(())
}

/// 获取目标用户最新一条聊天消息
pub async fn query_last_chat_record(
    uuid: &str,
    friend_id: &str,
) -> Result<Option<TextQuicMsgVo>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, TextQuicMsgVo>(r#"select * from chat_record where (send_user = ?1 and recv_user = ?2) or (send_user = ?2 and recv_user = ?1) order by timestamp desc limit 1"#)
        .bind(uuid)
        .bind(friend_id)
        .fetch_optional(&pool_sqlite)
        .await?;
    Ok(record)
}



/// 查询ack表中是否存在某条信息
pub async fn query_ack_record_from_db(nanoid: &str) -> Result<TextQuicMsgVo, anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    let record =
        sqlx::query_as::<_, TextQuicMsgVo>(r#"SELECT * FROM chat_record_ack WHERE nano_id = ?1"#)
            .bind(nanoid)
            .fetch_one(pool_sqlite)
            .await?;
    Ok(record)
}
