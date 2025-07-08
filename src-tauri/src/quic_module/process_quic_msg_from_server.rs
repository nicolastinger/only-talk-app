use crate::common_service::chat_service::{add_chat_record_to_db, add_local_ack_to_db, query_ack_record_from_db};
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
    //1.插入数据库
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let payload = serde_json::to_string(&msg)?;
    add_chat_record_to_db(msg, 0i32).await?;
    //2.发送消息给前端
    {
        APP_HANDLE
            .get()
            .ok_or(anyhow!("获取app失败"))?
            .emit("text_message", payload)?;
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
    add_chat_record_to_db(ack_record, 1).await?;
    // 发送消息给前端
    {
        APP_HANDLE
            .get()
            .ok_or(anyhow!("获取app失败"))?
            .emit("text_message", payload)?;
    }
    Ok(())
}