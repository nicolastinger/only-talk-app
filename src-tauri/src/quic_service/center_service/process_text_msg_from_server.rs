use std::time::Duration;

use std::net::{SocketAddr, UdpSocket};

use anyhow::anyhow;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
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
    MSG_TYPE_SYSTEM, MSG_TYPE_TEXT, MSG_TYPE_WEBRTC_SIGNAL, NOTIFY_TYPE_MSG,
};
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{APP_HANDLE, GLOBAL_MSG_SEND_LOCK, GLOBAL_QUIC_USER_INFO};

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
    let text_type = msg.text_type;

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
    match system_notification.level2.ok_or(anyhow!("level2为空"))? {
        1 => {
            friend_service::process_friend_notify_message(system_notification).await?;
        }
        2 => {
            info!("处理用户本身通知 {:?}", system_notification);
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
            Ok(candidate_data) => {
                match &candidate_data.candidate {
                    Some(candidate_str) => {
                        info!("ICE candidate 数据解析成功, candidate 字符串: {}", candidate_str);
                        
                        if let Some(parsed) = parse_ice_candidate(candidate_str) {
                            info!(
                                "解析 ICE candidate - type: {}, ip: {}, port: {}",
                                parsed.candidate_type, parsed.ip, parsed.port
                            );
                            
                            if parsed.candidate_type == "srflx" {
                                let local_uuid = {
                                    let guard = GLOBAL_QUIC_USER_INFO.read().await;
                                    guard.get("uuid").cloned().unwrap_or_default()
                                };
                                
                                tokio::spawn(async move {
                                    if let Err(e) = send_udp_ping_for_webrtc(&parsed.ip, parsed.port, &local_uuid).await {
                                        warn!("发送 UDP ping 失败: {}", e);
                                    }
                                });
                            }
                        } else {
                            warn!("parse_ice_candidate 返回 None, 无法解析 candidate 字符串: {}", candidate_str);
                        }
                    }
                    None => {
                        warn!("ICE candidate 字段为空，可能是候选收集完成信号");
                    }
                }
            }
            Err(e) => {
                warn!("解析 IceCandidateData 失败: {}", e);
            }
        }
    }
    
    let payload = serde_json::to_string(&msg)?;
    APP_HANDLE
        .get()
        .ok_or(anyhow!("获取app失败"))?
        .emit("webrtc_signal", payload)?;
    
    Ok(())
}

fn parse_ice_candidate(candidate_str: &str) -> Option<ParsedCandidate> {
    let parts: Vec<&str> = candidate_str.split_whitespace().collect();
    
    if parts.is_empty() || parts[0] != "candidate:" {
        return None;
    }
    
    let mut ip: Option<String> = None;
    let mut port: Option<u16> = None;
    let mut candidate_type: Option<String> = None;
    
    let mut i = 0;
    while i < parts.len() {
        match parts[i] {
            "typ" => {
                if i + 1 < parts.len() {
                    candidate_type = Some(parts[i + 1].to_string());
                    i += 2;
                    continue;
                }
            }
            _ => {
                if i >= 4 && parts.len() > i {
                    if ip.is_none() && parts[i].parse::<std::net::IpAddr>().is_ok() {
                        ip = Some(parts[i].to_string());
                    } else if ip.is_some() && port.is_none() {
                        if let Ok(p) = parts[i].parse::<u16>() {
                            port = Some(p);
                        }
                    }
                }
            }
        }
        i += 1;
    }
    
    if parts.len() > 4 {
        if let Ok(addr) = parts[4].parse::<std::net::IpAddr>() {
            ip = Some(addr.to_string());
        }
        if parts.len() > 5 {
            if let Ok(p) = parts[5].parse::<u16>() {
                port = Some(p);
            }
        }
    }
    
    match (ip, port, candidate_type) {
        (Some(ip), Some(port), Some(candidate_type)) => Some(ParsedCandidate {
            ip,
            port,
            candidate_type,
        }),
        _ => None,
    }
}

async fn send_udp_ping_for_webrtc(
    remote_ip: &str,
    remote_port: u16,
    local_uuid: &str,
) -> Result<(), anyhow::Error> {
    let local_port = find_available_udp_port(20000);
    let local_port = match local_port {
        Some(p) => p,
        None => {
            warn!("无法找到可用的 UDP 端口");
            return Err(anyhow!("无法找到可用的 UDP 端口"));
        }
    };
    
    let local_addr: SocketAddr = format!("0.0.0.0:{}", local_port).parse()?;
    let remote_addr: SocketAddr = format!("{}:{}", remote_ip, remote_port).parse()?;
    
    info!("WebRTC NAT 穿透: 本地 {} -> 远程 {}", local_addr, remote_addr);
    
    let socket = UdpSocket::bind(local_addr)?;
    socket.set_read_timeout(Some(std::time::Duration::from_millis(100)))?;
    
    let ping_data = format!("WEBRTC_PING:{}", local_uuid);
    
    for i in 0..3 {
        match socket.send_to(ping_data.as_bytes(), remote_addr) {
            Ok(_) => {
                info!("UDP ping 发送成功 (第{}次) -> {}", i + 1, remote_addr);
            }
            Err(e) => {
                warn!("UDP ping 发送失败 (第{}次): {}", i + 1, e);
            }
        }
        
        if i < 2 {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }
    
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert(
            "webrtc_remote_addr".to_string(),
            remote_addr.to_string(),
        );
    }
    
    info!("WebRTC UDP ping 完成，已记录远程地址: {}", remote_addr);
    Ok(())
}

fn find_available_udp_port(start_port: u16) -> Option<u16> {
    use std::net::{SocketAddrV4, Ipv4Addr};
    
    (start_port..=65535).find(|&port| {
        let addr = SocketAddrV4::new(Ipv4Addr::new(0, 0, 0, 0), port);
        UdpSocket::bind(addr).is_ok()
    })
}
