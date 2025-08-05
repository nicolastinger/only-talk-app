use anyhow::anyhow;
use crate::GLOBAL_QUIC_USER_INFO;
use crate::store::chat_record_db::get_chat_session;
use crate::store::init_db::GLOBAL_SQL_POOL;
use crate::vo::chat_session_vo::ChatSessionVo;
use crate::vo::text_quic_msg::TextQuicMsgVo;

/// 添加聊天记录到数据库
pub async fn add_chat_record_to_db(text_quic_msg: TextQuicMsgVo, state: i32) -> Result<(), anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    sqlx::query(r#"INSERT INTO chat_record (nano_id, raw, timestamp, send_user, recv_user, text_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#)
        .bind(&text_quic_msg.nano_id)
        .bind(&text_quic_msg.raw)
        .bind(text_quic_msg.timestamp)
        .bind(&text_quic_msg.send_user)
        .bind(&text_quic_msg.recv_user)
        .bind(text_quic_msg.text_type)
        .execute(pool_sqlite)
        .await?;
    sqlx::query(r#"INSERT INTO chat_record_state (nano_id, timestamp, send_user, recv_user, state) VALUES (?1, ?2, ?3, ?4, ?5)"#)
        .bind(&text_quic_msg.nano_id)
        .bind(text_quic_msg.timestamp)
        .bind(&text_quic_msg.send_user)
        .bind(&text_quic_msg.recv_user)
        .bind(state)
        .execute(pool_sqlite)
        .await?;
    Ok(())
}

/// 添加本地ack信息
pub async fn add_local_ack_to_db(text_quic_msg: TextQuicMsgVo) -> Result<(), anyhow::Error> {
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

/// 查询ack表中是否存在某条信息
pub async fn query_ack_record_from_db(nanoid: &String) -> Result<TextQuicMsgVo, anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    let record = sqlx::query_as::<_, TextQuicMsgVo>(r#"SELECT * FROM chat_record_ack WHERE nano_id = ?1"#)
        .bind(nanoid)
        .fetch_one(pool_sqlite)
        .await?;
    Ok(record)
}

/// 获取会话列表
pub async fn get_chat_session_from_db() -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let uuid = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").cloned().ok_or(anyhow!("获取失败"))?;
    Ok(get_chat_session(uuid).await?)
}