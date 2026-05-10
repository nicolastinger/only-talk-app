use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context};
use log::{error, info, warn};
use quinn::{Connection, Endpoint, SendStream};
use tokio::sync::Mutex;
use uuid::Uuid;
use crate::entity::quic_connection::{ConnectionType, FirstQuicMsg, QuicConnection};
use crate::quic_service::center_service::process_text_msg_from_server::process_msg;
use crate::quic_service::center_service::text_msg_service::{generate_text_msg, get_text_msg};
use crate::quic_service::safe_configuration::configure_client;
use crate::service::user_service::{disconnect_quic, get_user_info, insert_user_info};
use crate::utils::global_static_str::{PING, SYSTEM};
use crate::utils::message_types::MSG_TYPE_PING;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::{GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

// 客户端异步函数，尝试与服务器建立QUIC连接，文字信息连接
pub async fn run_client(server_addr: SocketAddr) -> Result<(), anyhow::Error> {
    // 创建客户端端点
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;

    endpoint.set_default_client_config(configure_client()); // 设置默认客户端配置

    info!("尝试连接到服务器");
    // 尝试连接到服务器
    let connection = endpoint.connect(server_addr, "onlytalk.local")?.await?;
    info!("[client] connected: addr={}", connection.remote_address()); // 打印连接成功的服务器地址

    // 开启一个双向流用于初始化和接收
    let (send_stream, mut _recv_stream) = connection.open_bi().await?;
    send_stream.set_priority(0)?; // 设置优先级
    let head_length = 9;
    let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    // bidi recv loop（初始化流接收）
    tokio::spawn(async move {
        let mut buffer = vec![0u8; 1024 * 8];
        loop {
            match _recv_stream.read(&mut buffer).await {
                Ok(Some(length)) => {
                    match process_rec_msg(
                        &mut buffer,
                        length,
                        &ConnectionType::Text,
                        buffer_msg.clone(),
                        head_length,
                    )
                    .await
                    {
                        Ok(_) => {}
                        Err(e) => {
                            error!("处理连接数据失败 {} {}", e, e.backtrace());
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

    // uni stream 接收循环（服务端通过 open_uni 推送 ACK/转发/心跳）
    {
        let conn_for_uni = connection.clone();
        tokio::spawn(async move {
            let uni_buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
            loop {
                match conn_for_uni.accept_uni().await {
                    Ok(mut recv) => {
                        let mut buf = vec![0u8; 1024 * 8];
                        match recv.read(&mut buf).await {
                            Ok(Some(length)) => {
                                let _ = process_rec_msg(
                                    &mut buf,
                                    length,
                                    &ConnectionType::Text,
                                    uni_buffer_msg.clone(),
                                    head_length,
                                )
                                .await;
                            }
                            Ok(None) => {}
                            Err(e) => {
                                error!("[客户端] uni流读取错误: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        error!("[客户端] uni accept 错误: {}", e);
                        break;
                    }
                }
            }
        });
    }

    match init_send_msg(send_stream, connection).await {
        Ok(_) => {
            info!("客户端初始化连接成功");
        }
        Err(_) => {
            error!("客户端初始化连接失败")
        }
    }
    Ok(())
}

async fn init_send_msg(mut send_stream: SendStream, conn: Connection) -> Result<(), anyhow::Error> {
    // 发送消息给服务器
    let mut first_quic_msg = FirstQuicMsg::new();
    let uuid = GLOBAL_QUIC_USER_INFO.read().await.get("uuid").ok_or(anyhow!("uuid为空"))?.clone();
    let token =
        GLOBAL_QUIC_USER_INFO.read().await.get("token").ok_or(anyhow!("token为空"))?.clone();
    first_quic_msg.dyn_header_size = 9;
    first_quic_msg.uuid = uuid;
    first_quic_msg.text_serde_struct = "user_chat_json".to_string();
    first_quic_msg.token = token;
    send_stream.write_all(serde_json::to_string(&first_quic_msg)?.as_bytes()).await?;

    tokio::time::sleep(Duration::from_secs(1)).await; //初始化一秒，防止连发元数据

    let now = get_now_time_stamp_as_millis().unwrap_or(0);

    let new_connection = QuicConnection {
        is_online: true,
        uuid: first_quic_msg.uuid,
        connection_type: ConnectionType::Text,
        conn: conn.clone(),
        create_time: now as u64,
        update_time: now as u64,
        ipv4addr: "".to_string(),
        ipv6addr: "".to_string(),
    };

    {
        let mut server_book = GLOBAL_QUIC_SERVER_LIST.write().await;
        server_book.insert("SERVER_TEXT".to_string(), new_connection);
    }

    tokio::spawn(async move {
        let ping_result = send_ping_msg(conn).await;
        if ping_result.is_err() {
            error!("发送心跳失败 {}", ping_result.unwrap_err());
        }
    });
    Ok(())
}

/// 发送心跳信息（按需开流）
async fn send_ping_msg(conn: Connection) -> Result<(), anyhow::Error> {
    let ping_uuid = Uuid::new_v4();
    let ping_uuid = ping_uuid.to_string();
    insert_user_info("ping_uuid", &ping_uuid).await?;

    let sender = get_user_info("uuid").await.context("获取uuid失败")?;
    loop {
        //一分钟发送心跳
        tokio::time::sleep(Duration::from_secs(60)).await;
        info!("发送quic客户端心跳");
        let ping_uuid = get_user_info("ping_uuid").await.context("获取ping实例id失败")?;
        let ping_lost_count = get_user_info("ping_lost_count").await.unwrap_or("0".to_string());
        let mut ping_lost_count = ping_lost_count.parse::<u64>().unwrap_or(0);
        if ping_lost_count > 3 {
            error!("ping_lost_count > 3, 停止维持心跳");
            // 清理连接资源
            disconnect_quic().await?;
            break;
        }

        if ping_uuid != ping_uuid {
            warn!("终止发送心跳，心跳实例id不一致，前: {}, 后: {}", ping_uuid, ping_uuid);
            break;
        }
        ping_lost_count += 1;
        insert_user_info("ping_lost_count", &ping_lost_count.to_string()).await?;
        let ping_msg =
            generate_text_msg(MSG_TYPE_PING, PING.as_bytes().to_vec(), SYSTEM.to_string(), sender.clone())
                .expect("");
        match send_via_new_stream(&conn, &ping_msg).await {
            Ok(_) => {
                info!("发送成功");
            }
            Err(e) => {
                error!("发送心跳失败 {}", e);
            }
        };
    }
    Ok(())
}

/// 按需开流发送数据
async fn send_via_new_stream(conn: &Connection, data: &[u8]) -> Result<(), anyhow::Error> {
    let mut send = conn.open_uni().await?;
    send.write_all(data).await?;
    send.finish().await?;
    Ok(())
}

async fn process_rec_msg(
    buffer: &mut Vec<u8>,
    length: usize,
    msg_type: &ConnectionType,
    buffer_msg: Arc<Mutex<Vec<u8>>>,
    head_length: usize,
) -> anyhow::Result<()> {
    match msg_type {
        ConnectionType::Text => {
            let text_vec = get_text_msg(buffer, length, buffer_msg, head_length).await?;
            info!("服务器返回的消息为 {:?}", text_vec);
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
