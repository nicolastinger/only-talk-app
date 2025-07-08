use anyhow::anyhow;
use crate::store::init_db::GLOBAL_SQL_POOL;
use crate::vo::text_quic_msg::TextQuicMsgVo;

/// 添加聊天记录到数据库
pub async fn add_chat_record_to_db(text_quic_msg: TextQuicMsgVo) -> Result<(), anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    sqlx::query(r#"INSERT INTO chat_record (nano_id, raw, created_at, send_user, recv_user, msg_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#)
        .bind(&text_quic_msg.id)
        .bind(&text_quic_msg.raw)
        .bind(text_quic_msg.timestamp)
        .bind(&text_quic_msg.send_user)
        .bind(&text_quic_msg.recv_user)
        .bind(text_quic_msg.text_type)
        .execute(pool_sqlite)
        .await?;
    sqlx::query(r#"INSERT INTO chat_record_state (nano_id, created_at, send_user, recv_user, state) VALUES (?1, ?2, ?3, ?4, ?5)"#)
        .bind(&text_quic_msg.id)
        .bind(text_quic_msg.timestamp)
        .bind(&text_quic_msg.send_user)
        .bind(&text_quic_msg.recv_user)
        .bind(0i32)
        .execute(pool_sqlite)
        .await?;
    Ok(())
}

/// 添加本地ack信息
pub async fn add_local_ack_to_db(text_quic_msg: TextQuicMsgVo) -> Result<(), anyhow::Error> {
    let pool_guard = GLOBAL_SQL_POOL.read().await;
    let pool_sqlite = pool_guard.as_ref().ok_or(anyhow!("获取失败"))?.as_ref();
    sqlx::query(r#"INSERT INTO chat_record (nano_id, raw, created_at, send_user, recv_user, msg_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#)
        .bind(&text_quic_msg.id)
        .bind(&text_quic_msg.raw)
        .bind(text_quic_msg.timestamp)
        .bind(&text_quic_msg.send_user)
        .bind(&text_quic_msg.recv_user)
        .bind(text_quic_msg.text_type)
        .execute(pool_sqlite)
        .await?;
    Ok(())
}