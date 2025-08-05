// 本地聊天记录sql

use anyhow::anyhow;
use log::{error, info};
use crate::models::chat_session::ChatSession;
use crate::models::Page;
use crate::models::text_msg::TextQuicMsg;
use crate::store::create_table::init_ddl;
use crate::store::get_db_client;
use crate::store::init_db::GLOBAL_SQL_POOL;
use crate::vo::chat_session_vo::ChatSessionVo;
use crate::vo::text_quic_msg::TextQuicMsgVo;

/// 分页获取聊天记录
pub async fn get_chat_record_from_db(text_quic_msg: TextQuicMsgVo,page: Page) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, TextQuicMsgVo>(r#"SELECT * FROM chat_record WHERE (send_user = ?1 and recv_user = ?2) OR (send_user = ?2 and recv_user = ?1)"#)
        .bind(text_quic_msg.send_user)
        .bind(text_quic_msg.recv_user)
        .fetch_all(&pool_sqlite)
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

/// 会话消息更新
pub async fn update_chat_session(chat_session: &ChatSession) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    // 执行更新
    let res = sqlx::query(r#"UPDATE chat_session SET nano_id = ?1, timestamp = ?2, text_type = ?3, unread_count = unread_count + ?4, last_message = ?5 WHERE send_user = ?6 and recv_user = ?7"#)
        .bind(&chat_session.nano_id)
        .bind(chat_session.timestamp)
        .bind(chat_session.text_type)
        .bind(chat_session.unread_count)
        .bind(&chat_session.last_message)
        .bind(&chat_session.send_user)
        .bind(&chat_session.recv_user)
        .execute(&pool_sqlite)
        .await?;
    info!("更新会话成功: {}", res.rows_affected());
    if res.rows_affected() < 1 {
        // 如果更新失败，则插入新的会话
        let result = sqlx::query(r#"INSERT INTO chat_session (nano_id, timestamp, text_type, unread_count, last_message, send_user, recv_user, session_type, is_show, is_top) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#)
            .bind(&chat_session.nano_id)
            .bind(chat_session.timestamp)
            .bind(chat_session.text_type)
            .bind(chat_session.unread_count)
            .bind(&chat_session.last_message)
            .bind(&chat_session.send_user)
            .bind(&chat_session.recv_user)
            .bind(chat_session.session_type)
            .bind(chat_session.is_show)
            .bind(chat_session.is_top)
            .execute(&pool_sqlite)
            .await;
        if let Err(e) = result {
            error!("保存会话消息失败 {:?}", e);
        }
    }
    Ok(())
}

/// 本地更新会话
pub async fn update_chat_session_local(chat_session: &ChatSession) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    // 执行更新
    sqlx::query(r#"UPDATE chat_session SET nano_id = ?1, timestamp = ?2, text_type = ?3, unread_count = ?4, last_message = ?5 WHERE send_user = ?6 and recv_user = ?7"#)
        .bind(&chat_session.nano_id)
        .bind(chat_session.timestamp)
        .bind(chat_session.text_type)
        .bind(chat_session.unread_count)
        .bind(&chat_session.last_message)
        .bind(&chat_session.send_user)
        .bind(&chat_session.recv_user)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 获取会话列表
pub async fn get_chat_session(uuid: String) -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatSessionVo>(r#"select cs.*, fr.friend_icon, fr.friend_name from chat_session cs left join
(SELECT friend_id, friend_name, friend_icon FROM friend WHERE me = ?1 and is_block = 0) fr
on cs.send_user = fr.friend_id
where cs.recv_user = ?1"#)
        .bind(uuid)
        .fetch_all(&pool_sqlite)
        .await?;
    Ok(record)
}