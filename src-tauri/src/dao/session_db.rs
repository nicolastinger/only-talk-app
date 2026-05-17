use log::{error, info};

use crate::dao::get_db_client;
use crate::entity::chat_session::ChatSession;
use crate::service::user_service::get_user_info;
use crate::vo::chat_session_vo::ChatSessionVo;

/// 会话消息更新
pub async fn update_chat_session_db(chat_session: &ChatSession) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let me = get_user_info("uuid").await?;
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
        let result = sqlx::query(r#"INSERT INTO chat_session (nano_id, timestamp, text_type, unread_count, last_message, send_user, recv_user, session_type, is_show, is_top, group_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"#)
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
            .bind(&chat_session.group_id)
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
    let me = get_user_info("uuid").await?;
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
        r#"select cs.*,
        COALESCE(fr.friend_icon, gr.group_icon, '') as friend_icon,
        COALESCE(fr.friend_name, gr.group_name, '') as friend_name
        from chat_session cs
        left join (SELECT friend_id, friend_name, friend_icon FROM friend WHERE me = ?1 and is_block = 0) fr
        on cs.send_user = fr.friend_id and cs.session_type != 2
        left join group_info gr on cs.group_id = gr.group_id and cs.session_type = 2
        where cs.recv_user = ?1 and cs.is_show = 1"#,
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

/// 隐藏会话（设置is_show为0）
pub async fn hide_chat_session_db(me: &str, friend_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(
        r#"UPDATE chat_session SET is_show = 0 WHERE (send_user = ?1 AND recv_user = ?2) OR (send_user = ?2 AND recv_user = ?1)"#,
    )
    .bind(friend_id)
    .bind(me)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}

/// 查询群聊会话
pub async fn query_group_chat_session(
    me: &str,
    group_id: &str,
) -> Result<Vec<ChatSession>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatSession>(
        "select * from chat_session where send_user = ?1 and recv_user = ?2 and session_type = 2",
    )
    .bind(group_id)
    .bind(me)
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 隐藏群聊会话
pub async fn hide_group_session_db(me: &str, group_id: &str) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    sqlx::query(
        "UPDATE chat_session SET is_show = 0 WHERE send_user = ?1 AND recv_user = ?2 AND session_type = 2",
    )
    .bind(group_id)
    .bind(me)
    .execute(&pool_sqlite)
    .await?;
    Ok(())
}
