// 本地聊天记录sql

use anyhow::anyhow;
use log::{error, info};
use crate::common_service::user_service::get_user_info;
use crate::models::chat_record_read::ChatRecordRead;
use crate::models::chat_session::ChatSession;
use crate::models::friend::Friend;
use crate::models::Page;
use crate::models::text_msg::TextQuicMsg;
use crate::store::create_table::init_ddl;
use crate::store::get_db_client;
use crate::store::init_db::GLOBAL_SQL_POOL;
use crate::vo::chat_session_vo::ChatSessionVo;
use crate::vo::text_quic_msg::TextQuicMsgVo;

/// 分页获取聊天记录
pub async fn query_chat_record_from_db(text_quic_msg: TextQuicMsgVo,page: Page) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, TextQuicMsgVo>(r#"SELECT * FROM chat_record WHERE (send_user = ?1 and recv_user = ?2) OR (send_user = ?2 and recv_user = ?1) order by timestamp asc"#)
        .bind(text_quic_msg.send_user)
        .bind(text_quic_msg.recv_user)
        .fetch_all(&pool_sqlite)
        .await?;
    Ok(record)
}

/// 根据id获取聊天记录
pub async fn query_chat_record_by_id_from_db(id: &String, uuid: &String) -> Result<TextQuicMsgVo, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, TextQuicMsgVo>(r#"SELECT * FROM chat_record WHERE nano_id = ? and (send_user = ? OR recv_user = ?)"#)
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

/// 会话消息更新
pub async fn update_chat_session(chat_session: &ChatSession) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let me = get_user_info(&"uuid".to_string()).await?;
    let send_user = match chat_session.send_user == me {
        true => chat_session.recv_user.clone(),
        false => chat_session.send_user.clone()
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
pub async fn update_chat_session_local(chat_session: &ChatSession) -> Result<(), anyhow::Error> {
    let me = get_user_info(&"uuid".to_string()).await?;
    let send_user = match chat_session.send_user == me {
        true => chat_session.recv_user.clone(),
        false => chat_session.send_user.clone()
    };
    let pool_sqlite = get_db_client().await?;
    // 执行更新
    sqlx::query(r#"UPDATE chat_session SET nano_id = ?1, timestamp = ?2, text_type = ?3, unread_count = ?4, last_message = ?5 WHERE send_user = ?6 and recv_user = ?7"#)
        .bind(&chat_session.nano_id)
        .bind(chat_session.timestamp)
        .bind(chat_session.text_type)
        .bind(chat_session.unread_count)
        .bind(&chat_session.last_message)
        .bind(&send_user)
        .bind(&me)
        .execute(&pool_sqlite)
        .await?;
    Ok(())
}

/// 获取会话列表
pub async fn query_chat_session(uuid: &String) -> Result<Vec<ChatSessionVo>, anyhow::Error> {
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

/// 获取已读消息
pub async fn query_last_read_msg(uuid: &String, timestamp: i64) -> Result<Vec<ChatRecordRead>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatRecordRead>(r#"select * from chat_record_read where recv_user = ?1 and timestamp > ?2"#)
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

/// 更新好友信息表
pub async fn update_friend_info(friend: &Friend) -> Result<(), anyhow::Error> {
    let res = sqlx::query(r#"UPDATE friend SET friend_id = ?1, friend_account = ?2, friend_name = ?3, friend_icon = ?4, friend_status = ?5, me = ?6, is_del = ?7, is_block = ?8, is_mute = ?9, is_top = ?10, is_show = ?11, created_at = ?12, updated_at = ?13, version = ?14, friend_info = ?15 WHERE friend_id = ?1 and me = ?6"#)
        .bind(&friend.friend_id)
        .bind(&friend.friend_account)
        .bind(&friend.friend_name)
        .bind(&friend.friend_icon)
        .bind(friend.friend_status)
        .bind(&friend.me)
        .bind(friend.is_del)
        .bind(friend.is_block)
        .bind(friend.is_mute)
        .bind(friend.is_top)
        .bind(friend.is_show)
        .bind(friend.created_at)
        .bind(friend.updated_at)
        .bind(friend.version)
        .bind(&friend.friend_info)
        .execute(&get_db_client().await?)
        .await;
    if res?.rows_affected() < 1 {
        // 如果更新失败，则插入新的好友信息
        let res = sqlx::query(r#"INSERT INTO friend (friend_id, friend_account, friend_name, friend_icon, friend_status, me, is_del, is_block, is_mute, is_top, is_show, created_at, updated_at, version, friend_info) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"#)
            .bind(&friend.friend_id)
            .bind(&friend.friend_account)
            .bind(&friend.friend_name)
            .bind(&friend.friend_icon)
            .bind(friend.friend_status)
            .bind(&friend.me)
            .bind(friend.is_del)
            .bind(friend.is_block)
            .bind(friend.is_mute)
            .bind(friend.is_top)
            .bind(friend.is_show)
            .bind(friend.created_at)
            .bind(friend.updated_at)
            .bind(friend.version)
            .bind(&friend.friend_info)
            .execute(&get_db_client().await?)
            .await;
        if let Err(e) = res {
            error!("更新好友信息表失败 {:?}", e);
        }
    }
    Ok(())
}

/// 获取好友信息表
pub async fn query_friend_info(uuid: &String) -> Result<Vec<Friend>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, Friend>(r#"select * from friend where me = ?1"#)
        .bind(uuid)
        .fetch_all(&pool_sqlite)
        .await?;
    Ok(record)
}

/// 获取单条好友信息
pub async fn query_friend_info_by_id(uuid: &String, friend_id: &String) -> Result<Friend, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, Friend>(r#"select * from friend where me = ?1 and friend_id = ?2 limit 1"#)
        .bind(uuid)
        .bind(friend_id)
        .fetch_one(&pool_sqlite)
        .await?;
    Ok(record)
}