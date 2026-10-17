//! 入站消息路由: 按 `text_type` 将消息转发给对应 handler, 自身不含业务逻辑。

use log::{error, info, warn};

use super::handlers::{
    ack, call_control, force_logout, group_chat, ping, private_chat, recall, system, webrtc,
};
use crate::models::bo::p2p_models::P2pInitMsg;
use crate::models::bo::text_msg::TextQuicMsg;
use crate::service::p2p_service::{process_p2p_msg, run_p2p_client, run_p2p_server};
use crate::utils::global_static_str::SYSTEM;
use crate::utils::message_types::{
    GROUP_MSG_TYPE_RECALL_SUCCESS, MSG_TYPE_FILE, MSG_TYPE_FORCE_LOGOUT, MSG_TYPE_GROUP_FILE,
    MSG_TYPE_GROUP_IMAGE, MSG_TYPE_GROUP_TEXT, MSG_TYPE_IMAGE, MSG_TYPE_JSON, MSG_TYPE_P2P,
    MSG_TYPE_P2P_USER_CLIENT, MSG_TYPE_P2P_USER_SERVER, MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
    MSG_TYPE_P2P_VIDEO_CALL_END, MSG_TYPE_P2P_VIDEO_CALL_INVITE, MSG_TYPE_P2P_VIDEO_CALL_REJECT,
    MSG_TYPE_PING, MSG_TYPE_RECALL, MSG_TYPE_RECALL_SUCCESS, MSG_TYPE_SYSTEM, MSG_TYPE_TEXT,
    MSG_TYPE_WEBRTC_SIGNAL, NOTIFY_TYPE_MSG,
};

/// 处理消息
pub async fn process_msg(text_vec: Vec<TextQuicMsg>) -> Result<(), anyhow::Error> {
    info!("处理消息 {:?}", text_vec);
    for msg in text_vec {
        match msg.text_type {
            // 单聊消息（文本/图片/文件）
            MSG_TYPE_TEXT | MSG_TYPE_IMAGE | MSG_TYPE_FILE => {
                private_chat::process_private_chat_message(msg).await?;
            }
            // 单聊消息撤回（伪撤回）：校验后清除目标消息，再按普通消息落库/上屏
            MSG_TYPE_RECALL => {
                recall::process_recall_message(msg).await?;
            }
            // 视频通话控制消息（12-15）：只转发控制命令，不落库、不进会话列表
            MSG_TYPE_P2P_VIDEO_CALL_INVITE
            | MSG_TYPE_P2P_VIDEO_CALL_ACCEPT
            | MSG_TYPE_P2P_VIDEO_CALL_REJECT
            | MSG_TYPE_P2P_VIDEO_CALL_END => {
                call_control::process_call_control(msg).await?;
            }
            // 群聊消息
            MSG_TYPE_GROUP_TEXT | MSG_TYPE_GROUP_IMAGE | MSG_TYPE_GROUP_FILE => {
                group_chat::process_group_chat_message(msg).await?;
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
                ping::process_ping_msg(msg).await?;
            }
            MSG_TYPE_WEBRTC_SIGNAL => {
                info!("接收到 WebRTC 信令消息 {:?}", msg);
                webrtc::process_webrtc_signal(msg).await?;
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
                match ack::process_ack_type(msg).await {
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
                match ack::process_group_ack_type(msg).await {
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
                system::process_notify_message(msg).await?;
            }
            // 收到系统消息
            MSG_TYPE_FORCE_LOGOUT => {
                force_logout::process_force_logout(msg).await?;
            }
            MSG_TYPE_SYSTEM => {
                info!("接收到系统通知 {:?}", msg);
                system::process_system_message(msg).await?;
            }
            _ => {
                warn!("接收到来源之外的消息 {:?}", msg);
            }
        }
    }
    Ok(())
}
