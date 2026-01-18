use crate::entity::chat_session::ChatSession;
use crate::service::user_service::get_user_info;
use crate::dao::get_db_client;
use crate::vo::chat_session_vo::ChatSessionVo;
use log::{error, info};

/// 会话消息更新
pub async fn update_chat_session_db(chat_session: &ChatSession) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let me = get_user_info(&"uuid".to_string()).await?;
    let send_user = match chat_session.send_user == me {
        true => chat_session.recv_user.clone(),
        false => chat_session.send_user.clone(),
    };
    // 执行更新
    let res = sqlx::query(r#"UPDATE chat_session SET nano_id = ?1, timestamp = ?2, text_type = ?3, unread_count = unread_count + ?4, last_message = ?5 WHERE send_user = ?6 and recv_user = ?7"#)
        .bind(&chat_session.nano_id)
        .bind(chat_session.timestamp)
        .bind(chat_session.text_type)
        .bind(chat_session.unread_count)
        .bind(&chat_session.last_message)
        .bind(&send_user)
        .bind(&me)
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
            .bind(&send_user)
            .bind(&me)
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
pub async fn update_chat_session_local_db(chat_session: &ChatSession) -> Result<(), anyhow::Error> {
    let me = get_user_info(&"uuid".to_string()).await?;
    let send_user = match chat_session.send_user == me {
        true => chat_session.recv_user.clone(),
        false => chat_session.send_user.clone(),
    };
    let pool_sqlite = get_db_client().await?;
    // 执行更新
    sqlx::query(r#"UPDATE chat_session SET nano_id = ?1, timestamp = ?2, text_type = ?3, unread_count = ?4, last_message = ?5, is_show = ?6, is_top = ?7 WHERE send_user = ?8 and recv_user = ?9"#)
        .bind(&chat_session.nano_id)
        .bind(chat_session.timestamp)
        .bind(chat_session.text_type)
        .bind(chat_session.unread_count)
        .bind(&chat_session.last_message)
        .bind(chat_session.is_show)
        .bind(chat_session.is_top)
        .bind(&send_user)
        .bind(&me)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 获取会话列表
pub async fn query_chat_session_db(uuid: &str) -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatSessionVo>(
        r#"select cs.*, fr.friend_icon, fr.friend_name from chat_session cs left join
(SELECT friend_id, friend_name, friend_icon FROM friend WHERE me = ?1 and is_block = 0) fr
on cs.send_user = fr.friend_id
where cs.recv_user = ?1"#,
    )
    .bind(uuid)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 获取跟目标用户的会话信息
pub async fn query_chat_session_by_user_db(
    uuid: &str,
    target_uuid: &str,
) -> Result<Vec<ChatSession>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatSession>(
        r#"select * from chat_session where send_user = ?1 and recv_user = ?2"#,
    )
    .bind(target_uuid)
    .bind(uuid)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(record)
}
