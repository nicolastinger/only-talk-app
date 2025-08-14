use std::sync::Arc;
use anyhow::anyhow;
use quinn::SendStream;
use tauri::Emitter;
use tokio::sync::RwLock;
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO};
use crate::models::chat_record_read::ChatRecordRead;
use crate::models::chat_session::ChatSession;
use crate::store::chat_record_db::{query_chat_session, update_chat_session_local, update_last_read_msg};
use crate::store::init_db::GLOBAL_SQL_POOL;
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
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


/// 本地清空已读消息计数
pub async fn clear_chat_session(chat_session: ChatSession)-> Result<(), anyhow::Error>{
    update_chat_session_local(&chat_session).await?;

    //发送会话消息给前端
    let chat_session_event = ChatSessionEvent {
        r#type: 0,
        data: ChatSessionVo::from(chat_session)?
    };
    let payload = serde_json::to_string(&chat_session_event)?;
    {
        APP_HANDLE
            .get()
            .ok_or(anyhow!("获取app失败"))?
            .emit("chat_session", payload)?;
    }
    Ok(())
}

/// 发送文本信息,最小作用范围
pub async fn send_msg(
    text_msg: Vec<u8>,
    send_stream: Arc<RwLock<SendStream>>,
) -> Result<String, anyhow::Error> {
    send_stream
        .write()
        .await
        .write_all(&text_msg)
        .await?;
    Ok("success".to_string())
}

/// 更新已读消息
pub async fn update_last_read_msg_from_db(last_msg_vec: Vec<TextQuicMsgVo>) -> Result<(), anyhow::Error> {
    let uuid = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").cloned().ok_or(anyhow!("获取失败"))?;
    for item in last_msg_vec {
        let chat_record_read = ChatRecordRead {
            id: 0,
            nano_id: item.nano_id,
            timestamp: item.timestamp,
            recv_user: uuid.clone(),
            send_user: match item.send_user == uuid { 
                true => item.recv_user.clone(),
                false => item.send_user.clone()
            },
        };
        update_last_read_msg(&chat_record_read).await?;
        
        //发送会话消息给前端
        let chat_session = ChatSession {
            id: 0,
            nano_id: chat_record_read.nano_id,
            timestamp: item.timestamp,
            text_type: item.text_type,
            unread_count: 0,
            last_message: item.raw,
            recv_user: item.recv_user,
            send_user: item.send_user,
            session_type: 0,
            is_show: 1,
            is_top: 0,
        };
        clear_chat_session(chat_session).await?;
    }
    Ok(())
}