use std::time::Duration;

use anyhow::anyhow;
use log::{error, info, warn};
use tauri::Emitter;
use tokio::time::timeout;

use crate::dao::chat_record_ack::{query_ack_record_from_db, update_chat_record_ack};
use crate::dao::chat_record_db::insert_chat_record;
use crate::dao::chat_record_send::{query_record_send_from_db, update_chat_record_send_success};
use crate::dao::session_db::{query_chat_session_by_user_db, update_chat_session_db};
use crate::emit_app::emit_controller::{process_p2p_msg, send_notify_msg};
use crate::entity::chat_session::ChatSession;
use crate::entity::p2p_models::P2pInitMsg;
use crate::entity::system_notification::SystemNotification;
use crate::entity::text_msg::TextQuicMsg;
use crate::service::chat_service::{clear_chat_session, process_no_send_success_msg};
use crate::service::friend_service;
use crate::service::p2p_service::{run_p2p_client, run_p2p_server};
use crate::service::user_service::get_user_info;
use crate::utils::global_static_str::SYSTEM;
use crate::utils::message_types::{
    CURRENT_SESSION_FRIEND, MSG_TYPE_FILE, MSG_TYPE_IMAGE, MSG_TYPE_JSON, MSG_TYPE_P2P,
    MSG_TYPE_P2P_USER_CLIENT, MSG_TYPE_P2P_USER_SERVER, MSG_TYPE_PING, MSG_TYPE_RECALL_SUCCESS,
    MSG_TYPE_SYSTEM, MSG_TYPE_TEXT, NOTIFY_TYPE_MSG,
};
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{APP_HANDLE, GLOBAL_MSG_SEND_LOCK};

/// 处理消息
pub async fn process_msg(text_vec: Vec<TextQuicMsg>) -> Result<(), anyhow::Error> {
    for msg in text_vec {
        match msg.text_type {
            // 聊天消息
            MSG_TYPE_TEXT | MSG_TYPE_IMAGE | MSG_TYPE_FILE => {
                process_text_type(msg).await?;
            }
            // JSON信息
            MSG_TYPE_JSON => {}
            MSG_TYPE_P2P => {
                info!("接收到p2p信息请求 {:?}", msg);
                let system = SYSTEM.to_string();
                if msg.send_user == system {
                    // TODO系统广播信息
                } else {
                    let p2p_msg: P2pInitMsg = serde_json::from_slice(&msg.raw)?;
                    process_p2p_msg(p2p_msg).await?;
                }
            }
            MSG_TYPE_PING => {
                info!("接收到服务器发送的ping");
            }
            // 本机作为p2p服务端, 建立连接
            MSG_TYPE_P2P_USER_SERVER => {
                info!("接收到建立p2p服务器信息 {:?}", msg);
                run_p2p_server(msg).await?;
            }
            // 本机作为p2p接收端, 建立连接
            MSG_TYPE_P2P_USER_CLIENT => {
                info!("接收到建立p2p接收端信息 {:?}", msg);
                run_p2p_client(msg).await?;
            }
            // 收到聊天消息ack
            MSG_TYPE_RECALL_SUCCESS => {
                match process_ack_type(msg).await {
                    Ok(_) => {
                        info!("处理ack成功");
                    }
                    Err(e) => {
                        error!("处理ack失败 {}", e);
                    }
                };
            }
            // 收到通知消息
            NOTIFY_TYPE_MSG => {
                info!("接收通知消息 {:?}", msg);
                process_notify_message(msg).await?;
            }
            // 收到系统消息
            MSG_TYPE_SYSTEM => {
                info!("接收到系统通知 {:?}", msg);
                process_system_message(msg).await?;
            }
            _ => {
                warn!("接收到来源之外的消息 {:?}", msg);
            }
        }
    }
    Ok(())
}

/// 处理纯文本消息
async fn process_text_type(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    //1.插入数据库
    insert_chat_record(&msg).await?;
    let payload = serde_json::to_string(&msg)?;

    //2.发送消息给前端
    {
        APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("text_message", payload)?;
    }

    //3.更新会话列表
    let mut flag = false;
    let me = get_user_info("uuid").await?;
    let friend_uuid = &msg.send_user;
    let current_session_friend = get_user_info(CURRENT_SESSION_FRIEND).await;
    if current_session_friend.is_ok() && current_session_friend? == *friend_uuid {
        flag = true;
    }
    let mut friend_session = query_chat_session_by_user_db(&me, friend_uuid).await?;
    if friend_session.is_empty() {
        let mut chat_session = ChatSession {
            id: 0,
            nano_id: msg.nano_id,
            timestamp: msg.timestamp,
            text_type: msg.text_type,
            unread_count: 1,
            last_message: msg.raw,
            recv_user: msg.recv_user,
            send_user: msg.send_user,
            session_type: 0,
            is_show: 0,
            is_top: 0,
        };
        if flag {
            chat_session.unread_count = 0;
            clear_chat_session(chat_session).await?;
        } else {
            update_session_list(chat_session).await?;
        }
    } else {
        let mut chat_session = friend_session.remove(0);
        chat_session.last_message = msg.raw;
        chat_session.timestamp = msg.timestamp;
        chat_session.text_type = msg.text_type;
        chat_session.nano_id = msg.nano_id;
        if flag {
            chat_session.unread_count = 0;
            update_chat_session_db(&chat_session).await?;
            clear_chat_session(chat_session).await?;
        } else {
            chat_session.unread_count = 1;
            update_session_list(chat_session).await?;
        }
    }

    Ok(())
}

// 更新会话列表
pub async fn update_session_list(chat_session: ChatSession) -> Result<(), anyhow::Error> {
    update_chat_session_db(&chat_session).await?;

    //发送会话消息给前端
    let chat_session_event =
        ChatSessionEvent { r#type: 1, data: ChatSessionVo::from(chat_session)? };
    let payload = serde_json::to_string(&chat_session_event)?;
    {
        APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("chat_session", payload)?;
    }
    Ok(())
}

/// 处理ack消息
async fn process_ack_type(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    info!("收到ack消息{:?}", text_quic_msg);
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let payload = serde_json::to_string(&msg)?;
    //1.查询ack表中该条消息
    let ack_record = query_record_send_from_db(&msg.raw).await;
    if ack_record.is_err() {
        warn!("查询ack表中该条消息失败 {:?}", ack_record.err());
        return Ok(());
    }
    let ack_record = ack_record?;
    let text_quic_msg_vo = TextQuicMsgVo {
        nano_id: msg.nano_id,
        text_type: ack_record.text_type,
        raw: ack_record.raw,
        recv_user: ack_record.recv_user,
        send_user: ack_record.send_user,
        timestamp: msg.timestamp,
    };
    // 2.聊天插入数据库
    insert_chat_record(&text_quic_msg_vo).await?;
    // 3. 标记ack表中该条消息为已确认
    update_chat_record_ack(&ack_record.send_id, 1, &text_quic_msg_vo.nano_id).await?;
    // 4. 标记发送列表中某条消息为已确认
    update_chat_record_send_success(&ack_record.send_id, &text_quic_msg_vo.nano_id).await?;
    tokio::spawn(async move {
        // 处理未发送的消息，ack返回
        timeout(Duration::from_secs(10), async {
            let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
            process_no_send_success_msg().await.expect("处理未发送消息失败");
        })
        .await
        .expect("ack返回，处理未发送消息超时");
    });
    // 发送消息给前端
    {
        APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("text_message", payload)?;
    }
    // 清除未读计数
    let chat_session = ChatSession {
        id: 0,
        nano_id: text_quic_msg_vo.nano_id,
        timestamp: ack_record.timestamp,
        text_type: ack_record.text_type,
        unread_count: 0,
        last_message: text_quic_msg_vo.raw,
        recv_user: text_quic_msg_vo.recv_user,
        send_user: text_quic_msg_vo.send_user,
        session_type: 1,
        is_show: 1,
        is_top: 0,
    };
    clear_chat_session(chat_session).await?;
    Ok(())
}

// 处理系统信息
async fn process_system_message(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let payload = serde_json::to_string(&msg)?;
    info!("接收到系统信息 {:?}", msg);

    {
        APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("system_message", payload)?;
    }
    Ok(())
}

// 处理通知消息
async fn process_notify_message(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let system_notification = serde_json::from_str::<SystemNotification>(&msg.raw)?;
    // 插入数据库
    SystemNotification::insert(&system_notification).await?;
    let payload = serde_json::to_string(&system_notification)?;
    // 发送消息给前端
    send_notify_msg(&payload)?;
    // 处理对应通知类型
    match system_notification.level1.ok_or(anyhow!("level1为空"))? {
        1 => {
            // 处理本系统通知
            info!("处理本系统通知 {:?}", system_notification);
            process_local_notify_message(system_notification).await?;
        }
        2 => {
            // 处理第三方通知
            info!("处理第三方通知 {:?}", system_notification);
        }
        _ => {
            // 处理其他通知
            info!("处理其他通知 {:?}", system_notification);
        }
    }
    Ok(())
}

async fn process_local_notify_message(
    system_notification: SystemNotification,
) -> Result<(), anyhow::Error> {
    // 处理本系统通知
    match system_notification.level2.ok_or(anyhow!("level2为空"))? {
        1 => {
            // 处理好友通知
            info!("处理好友通知 {:?}", system_notification);
            friend_service::process_friend_notify_message(system_notification).await?;
        }
        2 => {
            // 处理用户本身通知
            info!("处理用户本身通知 {:?}", system_notification);
        }
        _ => {
            // 处理其他通知
            info!("处理其他通知 {:?}", system_notification);
        }
    }
    Ok(())
}
