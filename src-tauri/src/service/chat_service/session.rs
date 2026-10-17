use anyhow::anyhow;
use log::{error, info};

use crate::dao::chat_record_db::query_last_chat_record;
use crate::dao::chat_record_read::update_last_read_msg;
use crate::dao::group_db::{query_group_by_id, upsert_group};
use crate::dao::group_message_read::update_group_message_read;
use crate::dao::session_db::{
    hide_chat_session_db, query_chat_session_by_user_db, query_chat_session_db,
    query_group_chat_session, search_chat_session_db, update_chat_session_db,
    update_chat_session_local_db,
};
use crate::models::dto::http_result::HttpResult;
use crate::models::entity::chat_record::ChatRecord;
use crate::models::entity::chat_record_read::ChatRecordRead;
use crate::models::entity::chat_session::ChatSession;
use crate::models::entity::group::Group;
use crate::models::entity::group_message_read::GroupMessageRead;
use crate::models::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::models::vo::group_vo::GroupVo;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::api_service::get_request;
use crate::service::user_service::{get_user_info, get_user_map};
use crate::utils::events;
use crate::utils::global_static_str::talk_api_base;
use crate::utils::message_types::MSG_TYPE_P2P;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::GLOBAL_QUIC_USER_INFO;

/// 获取会话列表
pub async fn get_chat_session_service() -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let uuid =
        GLOBAL_QUIC_USER_INFO.read().await.get("uuid").cloned().ok_or(anyhow!("获取失败"))?;
    query_chat_session_db(&uuid).await
}

/// 模糊搜索会话列表
pub async fn search_chat_session_service(
    keyword: String,
) -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let uuid =
        GLOBAL_QUIC_USER_INFO.read().await.get("uuid").cloned().ok_or(anyhow!("获取失败"))?;
    search_chat_session_db(&uuid, &keyword).await
}

/// 隐藏会话（is_show置0），新消息到达时会自动重新显示
pub async fn hide_chat_session_service(
    send_user: String,
    recv_user: String,
) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let friend_id = if send_user == me { recv_user } else { send_user };
    hide_chat_session_db(&me, &friend_id).await?;
    Ok(())
}

/// 本地清空已读消息计数
pub async fn clear_chat_session(chat_session: ChatSession) -> Result<(), anyhow::Error> {
    // 会话被读取时同步为显示状态，避免隐藏会话因读已读事件而滞留隐藏
    let mut chat_session = chat_session;
    chat_session.is_show = 1;
    update_chat_session_local_db(&chat_session).await?;

    // 清空/清理会话事件统一为规范方向（send_user=对方、recv_user=我），
    // 避免 ack 等路径把方向写反、前端误判
    let me = get_user_info("uuid").await?;
    let chat_session_event =
        ChatSessionEvent { r#type: 0, data: ChatSessionVo::from(chat_session.to_canonical(&me)) };
    let payload = serde_json::to_string(&chat_session_event)?;
    {
        events::emit("chat_session", payload)?;
    }
    Ok(())
}

/// 一键清空所有未读会话
pub async fn clear_all_unread_sessions_service() -> Result<(), anyhow::Error> {
    let uuid = get_user_info("uuid").await?;
    let sessions = query_chat_session_db(&uuid).await?;
    for session in sessions {
        if session.unread_count > 0 {
            let chat_session = ChatSession {
                id: 0,
                nano_id: session.nano_id,
                timestamp: session.timestamp,
                text_type: session.text_type,
                unread_count: 0,
                last_message: session.last_message,
                recv_user: uuid.clone(),
                send_user: session.send_user,
                session_type: session.session_type,
                is_show: session.is_show,
                is_top: session.is_top,
                group_id: session.group_id,
                session_uuid: session.session_uuid,
                last_message_id: session.last_message_id,
            };
            clear_chat_session(chat_session).await?;
        }
    }
    Ok(())
}

pub async fn update_group_last_read_msg_service(
    group_uuid: String,
    nano_id: String,
    timestamp: i64,
) -> Result<(), anyhow::Error> {
    let user_uuid = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;

    let record = GroupMessageRead {
        id: 0,
        nano_id,
        group_uuid: group_uuid.clone(),
        user_uuid: user_uuid.clone(),
        timestamp,
    };

    update_group_message_read(&record).await?;

    let mut group_session = query_chat_session_by_user_db(&user_uuid, &group_uuid).await?;
    if !group_session.is_empty() {
        let mut chat_session = group_session.remove(0);
        chat_session.unread_count = 0;
        update_chat_session_local_db(&chat_session).await?;

        let chat_session_event =
            ChatSessionEvent { r#type: 0, data: ChatSessionVo::from(chat_session) };
        let payload = serde_json::to_string(&chat_session_event)?;
        events::emit("chat_session", payload)?;
    }

    Ok(())
}

/// 已读目标用户的所有聊天消息
pub async fn update_last_read_msg_service(friend_uuid: String) -> Result<(), anyhow::Error> {
    let me = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;
    // 获取目标用户最新一条聊天消息
    let last_msg = query_last_chat_record(&me, &friend_uuid).await?;
    if last_msg.is_none() {
        return Ok(());
    }
    let last_msg = last_msg.ok_or(anyhow!("获取失败"))?;
    info!("最新消息: {}", last_msg.nano_id);
    // 获取目标用户的会话
    let mut chat_session = query_chat_session_by_user_db(&me, &friend_uuid).await?;
    if chat_session.is_empty() {
        let friend_uuid_clone = friend_uuid.clone();
        create_chat_session_service(friend_uuid_clone).await?;
        chat_session = query_chat_session_by_user_db(&me, &friend_uuid).await?;
    }
    let last_chat_session = match chat_session.len() {
        0 => {
            error!("获取会话失败，新建会话失败！");
            return Ok(());
        }
        1 => chat_session.remove(0),
        _ => {
            error!("获取会话失败，超出会话限制！");
            info!("开始删除旧会话...");
            // TODO: 删除旧会话，获取最新会话
            chat_session.remove(0)
        }
    };

    info!("最新聊天消息: {}，最新会话消息: {}", last_msg.nano_id, last_chat_session.nano_id);
    // 如果会话已存在，则不处理
    if last_chat_session.nano_id == last_msg.nano_id && last_chat_session.unread_count == 0 {
        return Ok(());
    }
    //发送会话消息给前端
    let chat_session = ChatSession {
        id: 0,
        nano_id: last_msg.nano_id,
        timestamp: last_msg.timestamp,
        text_type: last_msg.text_type,
        unread_count: 0,
        last_message: last_msg.raw,
        recv_user: me,
        send_user: friend_uuid,
        session_type: last_chat_session.session_type,
        is_show: last_chat_session.is_show,
        is_top: last_chat_session.is_top,
        group_id: last_chat_session.group_id,
        session_uuid: last_chat_session.session_uuid,
        last_message_id: last_chat_session.last_message_id,
    };
    clear_chat_session(chat_session).await?;
    Ok(())
}

/// 更新已读消息
pub async fn update_last_read_msg_from_db(
    last_msg_vec: Vec<TextQuicMsgVo>,
) -> Result<(), anyhow::Error> {
    let uuid = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;
    // 遍历更新，根据发送端和接收时间进行判断去重
    // 使用HashMap去重，key为(发送者, 接收者)，value为最新的消息
    let mut unique_msgs: std::collections::HashMap<(String, String), TextQuicMsgVo> =
        std::collections::HashMap::new();

    for item in last_msg_vec {
        let key = (
            match item.send_user == uuid {
                true => item.recv_user.clone(),
                false => item.send_user.clone(),
            },
            uuid.clone(),
        );

        // 如果已经存在这个发送者-接收者的组合，只保留时间戳更新的
        if let Some(existing_item) = unique_msgs.get(&key) {
            if item.timestamp > existing_item.timestamp {
                unique_msgs.insert(key, item);
            }
        } else {
            unique_msgs.insert(key, item);
        }
    }

    // 遍历去重后的消息进行处理
    for (_, item) in unique_msgs {
        // P2P 隐私握手(4)是瞬态信号：不写已读、不建/改会话，与好友聊天完全解耦
        if item.text_type == MSG_TYPE_P2P {
            continue;
        }
        let chat_record_read = ChatRecordRead {
            id: 0,
            nano_id: item.nano_id.clone(),
            timestamp: item.timestamp,
            recv_user: uuid.clone(),
            send_user: match item.send_user == uuid {
                true => item.recv_user.clone(),
                false => item.send_user.clone(),
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
            group_id: None,
            session_uuid: None,
            last_message_id: 0,
        };
        clear_chat_session(chat_session).await?;
    }
    Ok(())
}

/// 创建会话窗口
pub async fn create_chat_session_service(friend_uuid: String) -> Result<(), anyhow::Error> {
    // 获取当前用户
    let me = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;

    // 查询聊天记录
    let chat_record_count =
        ChatRecord::query_chat_record_count_by_friend(&me, &friend_uuid).await?;

    // 查询是否存在会话
    let chat_session = query_chat_session_db(&me).await?;
    for mut item in chat_session {
        if item.send_user == friend_uuid {
            // 存在会话
            item.is_show = 1;
            let chat_session = ChatSession::from(item);
            update_chat_session_local_db(&chat_session).await?;
            return Ok(());
        }
    }
    let chat_session = ChatSession {
        id: 0,
        nano_id: nanoid::nanoid!(),
        timestamp: get_now_time_stamp_as_millis()?,
        text_type: 0,
        unread_count: chat_record_count as i64,
        last_message: "".to_string(),
        recv_user: me,
        send_user: friend_uuid,
        session_type: 1,
        is_show: 1,
        is_top: 0,
        group_id: None,
        session_uuid: None,
        last_message_id: 0,
    };
    // 创建会话窗口
    update_chat_session_db(&chat_session).await?;
    Ok(())
}

/// 创建群聊会话
pub async fn create_group_chat_session_service(group_id: String) -> Result<(), anyhow::Error> {
    let me = get_user_map("uuid").await.map_err(|e| anyhow!(e))?;

    let group = query_group_by_id(&group_id).await?;
    if group.is_none() {
        let url = format!("{}/group/chat/info/{}", talk_api_base(), group_id);
        let result = get_request(url).await.map_err(|e| anyhow!(e))?;
        let response: HttpResult =
            serde_json::from_str(&result.body).map_err(|e| anyhow!("解析响应失败: {}", e))?;

        if response.code != 200 {
            return Err(anyhow!("群聊不存在"));
        }

        let group_vo: GroupVo =
            serde_json::from_value(response.data).map_err(|e| anyhow!("解析群信息失败: {}", e))?;

        let new_group = Group {
            id: 0,
            group_id: group_vo.group_uuid.clone(),
            group_name: group_vo.group_name.clone(),
            group_icon: group_vo.avatar.clone().unwrap_or_default(),
            owner_id: group_vo.owner_uuid.clone(),
            created_at: group_vo.created_at,
            updated_at: get_now_time_stamp_as_millis()?,
            member_count: group_vo.member_count,
            is_del: 0,
            is_show: 1,
            version: 0,
        };
        upsert_group(&new_group).await?;
    }

    let existing = query_group_chat_session(&me, &group_id).await?;
    if !existing.is_empty() {
        let mut chat_session =
            existing.into_iter().next().ok_or_else(|| anyhow::anyhow!("群聊会话不存在"))?;
        chat_session.is_show = 1;
        update_chat_session_local_db(&chat_session).await?;
        return Ok(());
    }

    let chat_session = ChatSession {
        id: 0,
        nano_id: nanoid::nanoid!(),
        timestamp: get_now_time_stamp_as_millis()?,
        text_type: 0,
        unread_count: 0,
        last_message: "".to_string(),
        recv_user: me,
        send_user: group_id.clone(),
        session_type: 2,
        is_show: 1,
        is_top: 0,
        group_id: Some(group_id),
        session_uuid: None,
        last_message_id: 0,
    };
    update_chat_session_db(&chat_session).await?;
    Ok(())
}

/// 获取群聊会话列表
pub async fn get_group_chat_session_service() -> Result<Vec<ChatSessionVo>, anyhow::Error> {
    let uuid =
        GLOBAL_QUIC_USER_INFO.read().await.get("uuid").cloned().ok_or(anyhow!("获取失败"))?;
    let all_sessions = query_chat_session_db(&uuid).await?;
    Ok(all_sessions.into_iter().filter(|s| s.session_type == 2).collect())
}
