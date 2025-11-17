use crate::utils::time::get_now_time_stamp_as_millis;
use log::{error, info, warn};
use quinn::{Endpoint, SendStream};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use anyhow::anyhow;
use tauri::Emitter;
use tokio::sync::{Mutex, RwLock};
use crate::{APP_HANDLE, GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};
use crate::entity::chat_session::ChatSession;
use crate::entity::quic_connection::{ConnectionType, FirstQuicMsg, QuicConnection};
use crate::quic_service::process_quic_msg_from_server::process_msg;
use crate::quic_service::safe_configuration::configure_client;
use crate::quic_service::text_msg_service::{generate_text_msg, generate_text_msg_without_nano, get_text_msg};
use crate::store::chat_record_db::insert_local_ack_to_db;
use crate::utils::global_static_str::{PING, SYSTEM};
use crate::utils::message_types::MSG_TYPE_PING;
use crate::vo::chat_session_vo::{ChatSessionEvent, ChatSessionVo};
use crate::vo::text_quic_msg::TextQuicMsgVo;

// 客户端异步函数，尝试与服务器建立QUIC连接
pub async fn run_client(server_addr: SocketAddr) -> Result<(), anyhow::Error> {
    // 创建客户端端点
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;

    endpoint.set_default_client_config(configure_client()); // 设置默认客户端配置

    info!("尝试连接到服务器");
    // 尝试连接到服务器
    let connection = endpoint
        .connect(server_addr, "onlytalk.local")?
        .await?;
    info!("[client] connected: addr={}", connection.remote_address()); // 打印连接成功的服务器地址

    // 开启一个双向流
    let (send_stream, mut _recv_stream) = connection.open_bi().await?;
    send_stream.set_priority(0)?; // 设置优先级
    let head_length = 9;
    let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    // 异步处理流中的数据
    tokio::spawn(async move {
        let mut buffer = vec![0u8; 1024 * 8];
        loop {
            match _recv_stream.read(&mut buffer).await {
                Ok(Some(length)) => {
                    match process_rec_msg(&mut buffer, length, &ConnectionType::Text,buffer_msg.clone(), head_length).await {
                        Ok(_) => {}
                        Err(e) => {
                            error!("处理连接数据失败 {}", e.backtrace());
                        }
                    };
                }
                Ok(None) => {
                    info!("[客户端]没有接收到数据");
                    break;
                }
                Err(e) => {
                    error!("[客户端] 读取错误: {}", e);
                    break;
                }
            }
        }
    });

    match init_send_msg(send_stream).await {
        Ok(_) => {
            info!("客户端初始化连接成功");
        }
        Err(_) => {
            error!("客户端初始化连接失败")
        }
    }
    Ok(())
}

async fn init_send_msg(mut send_stream: SendStream) -> Result<(), anyhow::Error> {
    // 发送消息给服务器
    let mut first_quic_msg = FirstQuicMsg::new();
    let uuid = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").ok_or(anyhow!("uuid为空"))?.clone();
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").ok_or(anyhow!("token为空"))?.clone();
    first_quic_msg.dyn_header_size = 9;
    first_quic_msg.uuid = uuid;
    first_quic_msg.text_serde_struct = "user_chat_json".to_string();
    first_quic_msg.token = token;
    send_stream
        .write_all(serde_json::to_string(&first_quic_msg)?.as_bytes())
        .await?;

    tokio::time::sleep(Duration::from_secs(1)).await;  //初始化一秒，防止连发元数据

    let send_stream = Arc::new(RwLock::new(send_stream));

    let now = get_now_time_stamp_as_millis().unwrap_or_else(|_| 0);

    let new_connection = QuicConnection {
        is_online: true,
        uuid: first_quic_msg.uuid,
        connection_type: ConnectionType::Text,
        send_stream: send_stream.clone(),
        create_time: now as u64,
        update_time: now as u64,
        ipv4addr: "".to_string(),
        ipv6addr: "".to_string(),
    };

    {
        let mut server_book = GLOBAL_QUIC_SERVER_LIST.write().await;
        server_book.insert("SERVER_TEXT".to_string(), new_connection);
    }

    let send_stream_ping = send_stream.clone();
    send_ping_msg(send_stream_ping);
    Ok(())
}

/// 发送心跳信息
fn send_ping_msg(send_stream_ping: Arc<RwLock<SendStream>>) {
    tokio::spawn(async move {
        loop {
            //一分钟发送心跳
            tokio::time::sleep(Duration::from_secs(60)).await;
            info!("发送心跳");
            let me = GLOBAL_QUIC_USER_INFO.read().await;
            let me = me.get("uuid");
            let sender = match me {
                None => "".to_string(),
                Some(v) => v.clone()
            };
            let ping_msg = generate_text_msg(
                MSG_TYPE_PING,
                PING.as_bytes().to_vec(),
                SYSTEM.to_string(),
                sender
            ).expect("");
            match send_stream_ping.write().await.write_all(&ping_msg).await {
                Ok(_) => {
                    info!("发送成功");
                },
                Err(e) => {
                    error!("发送心跳失败 {}", e);
                }
            };
        }
    });
}

async fn process_rec_msg(
    buffer: &mut Vec<u8>,
    length: usize,
    msg_type: &ConnectionType,
    buffer_msg: Arc<Mutex<Vec<u8>>>,
    head_length: usize
) -> anyhow::Result<()>{
    match msg_type {
        ConnectionType::Text => {
            let text_vec = get_text_msg(buffer, length, buffer_msg, head_length).await?;
            //info!("服务器返回的消息为 {:?}", text_vec);
            // 聊天信息处理
            process_msg(text_vec).await?;
        }
        ConnectionType::Img => {
            //TODO处理图片信息
        }
        _ => {
            warn!("不支持的信息 {:?}", msg_type);
        }
    }
    Ok(())
}



