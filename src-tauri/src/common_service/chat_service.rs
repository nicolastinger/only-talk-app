use anyhow::anyhow;
use crate::GLOBAL_QUIC_USER_INFO;
use crate::store::chat_record_db::query_chat_session;
use crate::store::init_db::GLOBAL_SQL_POOL;
use crate::vo::chat_session_vo::ChatSessionVo;
use crate::vo::text_quic_msg::TextQuicMsgVo;

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
    Ok(query_chat_session(&uuid).await?)
}