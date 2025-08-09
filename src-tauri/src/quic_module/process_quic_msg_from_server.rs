use crate::common_service::chat_service::{query_ack_record_from_db};
use crate::common_service::p2p_service::{run_p2p_client, run_p2p_server};
use crate::function::front_end::process_p2p_msg;
use crate::models::p2p_models::P2pInitMsg;
use crate::models::text_msg::{MessageType, TextQuicMsg};
use crate::utils::global_static_str::SYSTEM;
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::APP_HANDLE;
use anyhow::anyhow;
use log::{error, info, warn};
use tauri::Emitter;
use crate::models::chat_session::ChatSession;
use crate::store::chat_record_db::{insert_chat_record, update_chat_session, update_chat_session_local};
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};

/// 处理消息
pub async fn process_msg(text_vec: Vec<TextQuicMsg>) -> Result<(), anyhow::Error> {
    const TEXT_TYPE: u16 = MessageType::Text as u16;
    const P2P_TYPE: u16 = MessageType::P2P as u16;
    const PING_TYPE: u16 = MessageType::Ping as u16;
    const P2P_USER_SERVER: u16 = MessageType::P2pUserServer as u16;
    const P2P_USER_CLIENT: u16 = MessageType::P2pUserClient as u16;
    const RECALL_SUCCESS: u16 = MessageType::RecallSuccess as u16;
    for msg in text_vec {
        match msg.text_type {
            // 纯文本
            TEXT_TYPE => {
                process_text_type(msg).await?;
            }
            P2P_TYPE => {
                info!("接收到p2p信息请求 {:?}", msg);
                let system = SYSTEM.to_string();
                if msg.send_user == system {
                    // TODO系统广播信息
                } else {
                    let p2p_msg: P2pInitMsg = serde_json::from_slice(&msg.raw)?;
                    process_p2p_msg(p2p_msg).await?;
                }
            }
            PING_TYPE => {
                info!("接收到ping消息");
            }
            // 本机作为p2p服务端, 建立连接
            P2P_USER_SERVER => {
                info!("接收到建立p2p服务器信息 {:?}", msg);
                run_p2p_server(msg).await?;
            }
            // 本机作为p2p接收端, 建立连接
            P2P_USER_CLIENT => {
                info!("接收到建立p2p接收端信息 {:?}", msg);
                run_p2p_client(msg).await?;
            }
            // 收到消息ack
            RECALL_SUCCESS => {
               match process_ack_type(msg).await {  
                   Ok(_) => {
                        info!("处理ack成功");
                    },
                   Err(e) => {
                        error!("处理ack失败 {}", e);
                    }
               };
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
    //1.更新会话列表
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let chat_session = ChatSession {
        id: 0,
        nano_id: msg.nano_id.clone(),
        timestamp: msg.timestamp,
        text_type: msg.text_type,
        unread_count: 1,
        last_message: msg.raw.clone(),
        recv_user: msg.recv_user.clone(),
        send_user: msg.send_user.clone(),
        session_type: 0,
        is_show: 0,
        is_top: 0
    };
    update_session_list(chat_session).await?;
    let payload = serde_json::to_string(&msg)?;
    //2.发送消息给前端
    {
        APP_HANDLE
            .get()
            .ok_or(anyhow!("获取app失败"))?
            .emit("text_message", payload)?;
    }
    //3.插入数据库
    insert_chat_record(&msg).await?;
    Ok(())
}

// 更新会话列表
pub async fn update_session_list(chat_session: ChatSession) -> Result<(), anyhow::Error> {
    update_chat_session(&chat_session).await?;

    //发送会话消息给前端
    let chat_session_event = ChatSessionEvent {
        r#type: 1,
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

/// 处理ack消息
async fn process_ack_type(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    info!("收到ack消息{:?}", text_quic_msg);
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let payload = serde_json::to_string(&msg)?;
    //1.查询ack表中该条消息
    let ack_record = query_ack_record_from_db(&msg.raw).await?;
    //2.插入数据库
    insert_chat_record(&ack_record).await?;
    // 发送消息给前端
    {
        APP_HANDLE
            .get()
            .ok_or(anyhow!("获取app失败"))?
            .emit("text_message", payload)?;
    }
    Ok(())
}