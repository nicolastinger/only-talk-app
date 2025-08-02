// 本地聊天记录sql

use anyhow::anyhow;
use crate::models::Page;
use crate::models::text_msg::TextQuicMsg;
use crate::store::create_table::init_ddl;
use crate::store::get_db_client;
use crate::store::init_db::GLOBAL_SQL_POOL;
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
pub async fn insert_chat_record(text_quic_msg: TextQuicMsgVo) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query(r#"INSERT INTO chat_record (nano_id, raw, timestamp, send_user, recv_user, text_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#)
        .bind(text_quic_msg.nano_id)
        .bind(text_quic_msg.raw)
        .bind(text_quic_msg.timestamp)
        .bind(text_quic_msg.send_user)
        .bind(text_quic_msg.recv_user)
        .bind(text_quic_msg.text_type)
        .execute(&pool_sqlite)
        .await?;
        Ok(())
} 