use std::collections::HashMap;
use std::sync::{Arc};
use std::time::Duration;
use anyhow::anyhow;
use lazy_static::lazy_static;
use log::{info, warn};
use quinn::SendStream;
use tauri::Emitter;
use tokio::io::AsyncReadExt;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::sync::mpsc::Sender;
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO};
use crate::service::user_service::insert_user_info;
use crate::entity::p2p_models::{P2pVideoConfig, P2pVideoData};
use crate::entity::quic_connection::ConnectionType;
use crate::entity::text_msg::{TextQuicMsg};
use crate::quic_service::models::TargetSendStream;
use crate::quic_service::center_service::text_msg_service::{generate_text_msg, get_text_msg};
use crate::utils::global_static_str::{PING, SYSTEM};
use crate::utils::message_types::{MSG_TYPE_P2P, MSG_TYPE_P2P_VIDEO_CALL, MSG_TYPE_P2P_VIDEO_CONFIG, MSG_TYPE_P2P_VIDEO_DATA, MSG_TYPE_PING, MSG_TYPE_TEXT};

lazy_static! {
  pub static ref P2P_STREAM_SENDER: Arc<RwLock<HashMap<String, TargetSendStream>>> = Arc::new(RwLock::new(HashMap::new()));
}

/// 传输的视频帧
lazy_static! {
   pub static ref LOG_SENDER: Mutex<Sender<P2pVideoData>> = {
        let (tx, mut rx) = mpsc::channel::<P2pVideoData>(1000);
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                // 开发调试
              // if let Some(handle) = APP_HANDLE.get() {
              //    handle.emit("video_frame", msg.video_data).map_err(|e| e.to_string()).unwrap();
              // }
                tokio::spawn(async move {
                    let video_data = generate_text_msg(
                        MSG_TYPE_P2P_VIDEO_DATA,
                        msg.video_data,
                        String::new(),
                        String::new()
                    ).expect("generate_text_msg error");
                    let send_stream = get_sender(&msg.uuid).await.expect("no send_stream");
                    send_stream.lock().await.write_all(&video_data).await.expect("write_all error");
                });
            }
        });
        Mutex::new(tx)
    };
}

/// 获取p2p连接
pub async fn get_sender(target_uuid: &str) -> Result<Arc<Mutex<SendStream>>, anyhow::Error> {
    let sender = {
        let guard = P2P_STREAM_SENDER.read().await;
        let target_sender = guard.get(target_uuid).ok_or(anyhow!("no target_sender"))?;
        let sender = target_sender.send_stream.clone();
        sender
    };
    Ok(sender)
}


pub async fn process_rec_msg(
    buffer: &mut Vec<u8>,
    length: usize,
    msg_type: &ConnectionType,
    buffer_msg: Arc<Mutex<Vec<u8>>>,
    head_length: usize,
) -> anyhow::Result<()> {
    match msg_type {
        ConnectionType::Video => {
            let text_vec = get_text_msg(buffer, length, buffer_msg, head_length).await?;
            info!("收到p2p客户端信息 {:?}", text_vec.len());
            // 聊天信息处理
            process_msg(text_vec).await?;
        }
        _ => {
            warn!("不支持的信息 {:?}", msg_type);
        }
    }
    Ok(())
}

/// 处理消息
pub async fn process_msg(text_vec: Vec<TextQuicMsg>) -> Result<(), anyhow::Error> {
    for msg in text_vec {
        match msg.text_type {
            MSG_TYPE_P2P_VIDEO_CALL => {
                info!("接收到p2p信息 {:?}", msg);
                let accept_user = {
                    let guard = GLOBAL_QUIC_USER_INFO.read().await;
                    let accept_user = guard.get("accept");
                    let accept_user = accept_user.ok_or(anyhow!("获取用户失败"))?.clone();
                    accept_user
                };
                if accept_user == msg.send_user {
                    if let Some(handle) = APP_HANDLE.get() {
                        handle.emit("video_frame", msg.raw)?;
                    }
                }
            },
            MSG_TYPE_P2P_VIDEO_DATA => {
                if let Some(handle) = APP_HANDLE.get() {
                    handle.emit("video_frame", msg.raw)?;
                }
            },
            MSG_TYPE_P2P_VIDEO_CONFIG => {
                info!("接收到p2p视频配置信息 {:?}", msg);
                let key = format!("p2p_video_config_{}", msg.send_user);
                let video_config = serde_json::from_slice::<P2pVideoConfig>(&msg.raw)?;
                let video_str = serde_json::to_string(&video_config)?;
                insert_user_info(&key, &video_str).await?;
            },
            MSG_TYPE_PING => {
                info!("接收到p2p的ping消息 {:?}", msg);
            }
            _ => {
                info!("意外情况 {:?}", msg);
            }
        }
    }

    Ok(())
}

/// 发送心跳信息
pub fn send_ping_msg(send_stream_ping: Arc<Mutex<SendStream>>, uuid: String) {
    tokio::spawn(async move {
        loop {
            info!("发送p2p心跳");
            let me = {
                let guard = GLOBAL_QUIC_USER_INFO.read().await;
                let me = guard.get("uuid").unwrap();
                me.clone()
            };
            let ping_msg = generate_text_msg(
                MSG_TYPE_PING,
                PING.as_bytes().to_vec(),
                SYSTEM.to_string(),
                me
            ).expect("");
            {
                let mut send_stream = send_stream_ping.lock().await;
                send_stream.write_all(&ping_msg).await.unwrap();
            }
            //一分钟发送心跳
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}