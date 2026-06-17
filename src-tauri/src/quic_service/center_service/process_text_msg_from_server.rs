use std::time::Duration;

use crate::dao::chat_record_ack::update_chat_record_ack;
use crate::dao::chat_record_db::insert_chat_record;
use crate::dao::chat_record_send::{query_record_send_from_db, update_chat_record_send_success};
use crate::dao::group_chat_record_db::insert_group_chat_record;
use crate::dao::group_message_ack::{
    query_group_message_ack_by_local_nano_id, update_group_message_ack_status,
};
use crate::dao::session_db::{query_chat_session_by_user_db, update_chat_session_db};
use crate::emit_app::emit_controller::{process_p2p_msg, send_notify_msg};
use crate::entity::chat_session::ChatSession;
use crate::entity::group_chat_record::GroupChatRecord;
use crate::entity::p2p_models::P2pInitMsg;
use crate::entity::system_notification::SystemNotification;
use crate::entity::text_msg::TextQuicMsg;
use crate::service::chat_service::{clear_chat_session, process_no_send_success_msg};
use crate::service::chat_service::{
    create_chat_session_service, create_group_chat_session_service,
};
use crate::service::friend_service;
use crate::service::group_service;
use crate::service::p2p_service::{run_p2p_client, run_p2p_server};
use crate::service::user_service::{get_user_info, insert_user_info};
use crate::utils::global_static_str::SYSTEM;
use crate::utils::message_types::{
    CURRENT_SESSION_FRIEND, GROUP_MSG_TYPE_RECALL_SUCCESS, MSG_TYPE_FILE, MSG_TYPE_GROUP_FILE,
    MSG_TYPE_GROUP_IMAGE, MSG_TYPE_GROUP_NOTIFICATION, MSG_TYPE_GROUP_TEXT, MSG_TYPE_IMAGE,
    MSG_TYPE_JSON, MSG_TYPE_P2P, MSG_TYPE_P2P_USER_CLIENT, MSG_TYPE_P2P_USER_SERVER, MSG_TYPE_PING,
    MSG_TYPE_RECALL_SUCCESS, MSG_TYPE_SYSTEM, MSG_TYPE_TEXT, MSG_TYPE_WEBRTC_SIGNAL,
    NOTIFY_TYPE_MSG,
};
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{APP_HANDLE, GLOBAL_MSG_SEND_LOCK, GLOBAL_QUIC_USER_INFO};
use anyhow::anyhow;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::time::timeout;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
struct WebRTCSignalMessage {
    #[serde(rename = "type")]
    msg_type: String,
    sender: String,
    receiver: String,
    data: serde_json::Value,
    timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct IceCandidateData {
    candidate: Option<String>,
    #[serde(rename = "sdpMid")]
    sdp_mid: Option<String>,
    #[serde(rename = "sdpMLineIndex")]
    sdp_mline_index: Option<u16>,
    #[serde(rename = "usernameFragment")]
    username_fragment: Option<String>,
}

struct ParsedCandidate {
    ip: String,
    port: u16,
    candidate_type: String,
}

/// 处理消息
pub async fn process_msg(text_vec: Vec<TextQuicMsg>) -> Result<(), anyhow::Error> {
    info!("处理消息 {:?}", text_vec);
    for msg in text_vec {
        match msg.text_type {
            // 单聊消息
            MSG_TYPE_TEXT | MSG_TYPE_IMAGE | MSG_TYPE_FILE => {
                process_private_chat_message(msg).await?;
            }
            // 群聊消息
            MSG_TYPE_GROUP_TEXT | MSG_TYPE_GROUP_IMAGE | MSG_TYPE_GROUP_FILE => {
                process_group_chat_message(msg).await?;
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
                // 处理ping消息
                process_ping_msg(msg).await?;
            }
            MSG_TYPE_WEBRTC_SIGNAL => {
                info!("接收到 WebRTC 信令消息 {:?}", msg);
                process_webrtc_signal(msg).await?;
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
            // 收到群消息ack
            GROUP_MSG_TYPE_RECALL_SUCCESS => {
                match process_group_ack_type(msg).await {
                    Ok(_) => {
                        info!("处理群ack成功");
                    }
                    Err(e) => {
                        error!("处理群ack失败 {}", e);
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

async fn is_group_message(recv_user: &str) -> bool {
    crate::entity::group::Group::query_by_group_id(recv_user)
        .await
        .map(|g| g.is_some())
        .unwrap_or(false)
}

/// 处理单聊消息
async fn process_private_chat_message(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let me = get_user_info("uuid").await?;

    insert_chat_record(&msg).await?;

    let payload = serde_json::to_string(&msg)?;
    APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("text_message", payload)?;

    let friend_uuid = &msg.send_user;
    let mut flag = false;
    let current_session_friend = get_user_info(CURRENT_SESSION_FRIEND).await;
    if current_session_friend.is_ok() && current_session_friend? == *friend_uuid {
        flag = true;
    }

    let mut friend_session = query_chat_session_by_user_db(&me, friend_uuid).await?;
    if friend_session.is_empty() {
        create_chat_session_service(friend_uuid.to_string()).await?;
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
            group_id: None,
        };
        if flag {
            chat_session.unread_count = 0;
            update_chat_session_db(&chat_session).await?;
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

/// 处理群聊消息
async fn process_group_chat_message(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let me = get_user_info("uuid").await?;

    let record = GroupChatRecord {
        id: 0,
        nano_id: msg.nano_id.clone(),
        text_type: msg.text_type,
        raw: msg.raw.clone(),
        group_id: msg.recv_user.clone(),
        send_user: msg.send_user.clone(),
        timestamp: msg.timestamp,
    };
    insert_group_chat_record(&record).await?;

    let payload = serde_json::to_string(&msg)?;
    APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("text_message", payload)?;

    let group_id = &msg.recv_user;
    let current_session = get_user_info(CURRENT_SESSION_FRIEND).await;
    let mut flag = false;
    if let Ok(ref cur) = current_session {
        if cur == group_id {
            flag = true;
        }
    }

    let mut group_session = query_chat_session_by_user_db(&me, group_id).await?;
    if group_session.is_empty() {
        create_group_chat_session_service(group_id.to_string()).await?;
        let mut chat_session = ChatSession {
            id: 0,
            nano_id: msg.nano_id,
            timestamp: msg.timestamp,
            text_type: msg.text_type,
            unread_count: 1,
            last_message: msg.raw,
            recv_user: me.clone(),
            send_user: group_id.clone(),
            session_type: 2,
            is_show: 1,
            is_top: 0,
            group_id: Some(group_id.clone()),
        };
        if flag {
            chat_session.unread_count = 0;
            clear_chat_session(chat_session).await?;
        } else {
            update_session_list(chat_session).await?;
        }
    } else {
        let mut chat_session = group_session.remove(0);
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
        // P2P信令消息（如视频通话邀请、P2P握手等）不经过chat_service发送流程，
        // 不会在chat_record_send表中留有记录，收到ACK时查不到是正常情况，静默跳过即可
        info!("ACK对应的消息不在发送记录表中(可能是P2P信令消息)，跳过处理: send_id={}", msg.raw);
        return Ok(());
    }
    let ack_record = ack_record?;

    // 检查是否已经处理过该ACK（防止重复处理）
    if ack_record.send_status == 3 {
        info!("消息已经确认过，跳过重复处理: send_id={}", msg.raw);
        return Ok(());
    }

    let text_quic_msg_vo = TextQuicMsgVo {
        nano_id: msg.nano_id,
        text_type: ack_record.text_type,
        raw: ack_record.raw,
        recv_user: ack_record.recv_user,
        send_user: ack_record.send_user,
        timestamp: msg.timestamp,
    };

    // 2.聊天插入数据库（使用INSERT OR IGNORE避免重复插入）
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
    let is_group = is_group_message(&text_quic_msg_vo.recv_user).await;
    let recv_user = text_quic_msg_vo.recv_user.clone();
    let chat_session = ChatSession {
        id: 0,
        nano_id: text_quic_msg_vo.nano_id,
        timestamp: ack_record.timestamp,
        text_type: ack_record.text_type,
        unread_count: 0,
        last_message: text_quic_msg_vo.raw,
        recv_user: text_quic_msg_vo.recv_user,
        send_user: text_quic_msg_vo.send_user,
        session_type: if is_group { 2 } else { 1 },
        is_show: 1,
        is_top: 0,
        group_id: if is_group { Some(recv_user) } else { None },
    };
    clear_chat_session(chat_session).await?;
    Ok(())
}

/// 处理群ack消息
async fn process_group_ack_type(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    info!("收到群ack消息{:?}", text_quic_msg);
    let msg = TextQuicMsgVo::from(text_quic_msg)?;

    let ack_record = query_group_message_ack_by_local_nano_id(&msg.raw).await?;
    let ack_record =
        ack_record.ok_or_else(|| anyhow!("群ack记录不存在: local_nano_id={}", msg.raw))?;

    if ack_record.ack_status == 1 {
        info!("群消息已经确认过，跳过重复处理: local_nano_id={}", msg.raw);
        return Ok(());
    }

    // ack 成功后插入群聊记录
    let record = GroupChatRecord {
        id: 0,
        nano_id: msg.nano_id.clone(),
        text_type: ack_record.text_type,
        raw: ack_record.raw.clone(),
        group_id: ack_record.group_uuid.clone(),
        send_user: ack_record.send_user.clone(),
        timestamp: ack_record.timestamp,
    };
    insert_group_chat_record(&record).await?;

    update_group_message_ack_status(&ack_record.local_nano_id, &msg.nano_id, 1).await?;

    // emit 给前端：通知消息已送达
    let payload = serde_json::to_string(&msg)?;
    APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("group_message_ack", payload)?;

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
    // 发送完整通知数据给前端
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
    match system_notification.level2.ok_or(anyhow!("level2为空"))? {
        1 => {
            friend_service::process_friend_notify_message(system_notification).await?;
        }
        2 => {
            info!("处理用户本身通知 {:?}", system_notification);
        }
        3 => {
            group_service::process_group_notify_message(system_notification).await?;
        }
        _ => {
            info!("处理其他通知 {:?}", system_notification);
        }
    }
    Ok(())
}

async fn process_webrtc_signal(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let signal: WebRTCSignalMessage = serde_json::from_str(&msg.raw)?;

    info!(
        "收到 WebRTC 信令消息 - type: {}, sender: {}, receiver: {}",
        signal.msg_type, signal.sender, signal.receiver
    );

    if signal.msg_type == "candidate" {
        info!("开始解析 ICE candidate, data: {:?}", signal.data);

        match serde_json::from_value::<IceCandidateData>(signal.data.clone()) {
            Ok(candidate_data) => match &candidate_data.candidate {
                Some(candidate_str) => {
                    info!("ICE candidate 数据解析成功, candidate 字符串: {}", candidate_str);

                    if let Some(parsed) = parse_ice_candidate(candidate_str) {
                        info!(
                            "解析 ICE candidate - type: {}, ip: {}, port: {}",
                            parsed.candidate_type, parsed.ip, parsed.port
                        );
                    } else {
                        warn!(
                            "parse_ice_candidate 返回 None, 无法解析 candidate 字符串: {}",
                            candidate_str
                        );
                    }
                }
                None => {
                    warn!("ICE candidate 字段为空，可能是候选收集完成信号");
                }
            },
            Err(e) => {
                warn!("解析 IceCandidateData 失败: {}", e);
            }
        }
    }

    let payload = serde_json::to_string(&msg)?;
    APP_HANDLE.get().ok_or(anyhow!("获取app失败"))?.emit("webrtc_signal", payload)?;

    Ok(())
}

fn parse_ice_candidate(candidate_str: &str) -> Option<ParsedCandidate> {
    let parts: Vec<&str> = candidate_str.split_whitespace().collect();

    if parts.is_empty() || !parts[0].starts_with("candidate:") {
        return None;
    }

    if parts.len() < 8 {
        return None;
    }

    let ip = parts[4].to_string();
    let port: u16 = parts[5].parse().ok()?;
    let candidate_type = parts[7].to_string();

    Some(ParsedCandidate { ip, port, candidate_type })
}

async fn process_ping_msg(msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    info!("{:?} 收到quic服务器的ping消息", msg.recv_user);
    insert_user_info("ping_lost_count", "0").await?;
    Ok(())
}
