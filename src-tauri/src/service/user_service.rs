use crate::dto::add_read_chat_record::AddReadChatRecord;
use crate::dto::http_result::HttpResult;
use crate::entity::chat_session::ChatSession;
use crate::entity::friend::Friend;
use crate::entity::system_notification::SystemNotification;
use crate::entity::text_msg::TextQuicMsg;
use crate::quic_service::center_service::text_quic_client::run_client;
use crate::service::friend_service::update_friend_list;
use crate::dao::chat_record_db::{insert_chat_record, query_last_read_msg};
use crate::dao::init_db::init_sqlite;
use crate::utils::http_utils::post_request;
use crate::{GLOBAL_QUIC_USER_INFO, GLOBAL_READ_TASK_HANDLE};
use anyhow::anyhow;
use log::{error, info, warn};
use std::collections::HashMap;
use std::net::SocketAddr;

use crate::dao::session_db::update_chat_session_db;
use crate::utils::dns::resolve_ipv4;
use crate::utils::global_static_str::{DOMAIN_NAME, QUIC_SERVER_ADDR, TALK_API};
use crate::vo::friend_vo::FriendListVO;
use crate::vo::http_response::Response;
use crate::vo::text_quic_msg::TextQuicMsgVo;

/// 用户登录执行操作
pub async fn user_login() -> Result<(), anyhow::Error> {
    info!("用户登录开始");
    // 初始化数据库
    init_sqlite().await.expect("初始化数据库失败!");
    //1、获取好友列表
    update_friend_list().await.unwrap_or_else(|e| {
        error!("获取好友列表失败 {:?}", e);
    });
    //2、获取未读消息
    get_unread_message()
        .await
        .unwrap_or_else(|e| error!("获取未读消息失败 {:?}", e));
    //3、获取未读通知
    get_unread_notification()
        .await
        .unwrap_or_else(|e| error!("获取未读通知失败 {:?}", e));
    //4、启动定时已读任务
    let handle = start_read_task().await?;
    // 保存任务句柄到全局变量
    {
        let mut task_handle = GLOBAL_READ_TASK_HANDLE.write().await;
        *task_handle = Some(handle);
    }
    //启动quic服务
    let addr = resolve_ipv4(DOMAIN_NAME, 4433).await?;
    tokio::spawn(async move {
        match run_client(SocketAddr::from(addr)).await {
            Ok(_) => {}
            Err(e) => {
                error!("创建quic客户端失败 {:?}", e);
            }
        }
    });
    Ok(())
}

/// 获取用户信息
pub async fn get_user_info(key: &str) -> Result<String, anyhow::Error> {
    let guard = GLOBAL_QUIC_USER_INFO.read().await;
    match guard.get(key) {
        Some(value) => Ok(value.clone()),
        None => Err(anyhow!("数据不存在")),
    }
}

/// 插入用户信息
pub async fn insert_user_info(key: &str, value: &str) -> Result<(), anyhow::Error> {
    GLOBAL_QUIC_USER_INFO
        .write()
        .await
        .insert(key.to_string(), value.to_string());
    Ok(())
}

/// 获取未读消息
pub async fn get_unread_message() -> Result<(), anyhow::Error> {
    let url = format!("{}/msg/get_unread_chat_record", TALK_API);
    let result = post_request(url, String::new())
        .await
        .map_err(|e| anyhow!(e))?;

    let data = result.body;
    let result = serde_json::from_str::<HttpResult>(&data)?;
    if result.code == 204 {
        info!("无未读消息");
        return Ok(());
    }
    if result.code != 200 {
        error!("获取未读通知失败 {:?}", result);
        return Ok(());
    }
    let json: Vec<TextQuicMsg> = serde_json::from_value(result.data)?;
    let text_quic_msg_vec = TextQuicMsgVo::from_vec(json)?;
    info!("获取未读消息结果 {:?}", text_quic_msg_vec);
    // 未读消息计数
    let mut unread_count_map: HashMap<String, ChatSession> = HashMap::new();
    let uuid = get_user_info(&"uuid".to_string()).await?;

    for text_quic_msg in text_quic_msg_vec {
        //保存未读消息
        match insert_chat_record(&text_quic_msg).await {
            Ok(_) => {}
            Err(_) => {
                continue;
            }
        }
        let user = match text_quic_msg.recv_user == uuid {
            true => text_quic_msg.send_user.clone(),
            false => text_quic_msg.recv_user.clone(),
        };
        let chat_session = unread_count_map.get_mut(&user);
        if chat_session.is_none() {
            let chat_session = ChatSession {
                id: 0,
                nano_id: text_quic_msg.nano_id,
                timestamp: text_quic_msg.timestamp,
                text_type: text_quic_msg.text_type,
                unread_count: 1,
                last_message: text_quic_msg.raw,
                recv_user: uuid.clone(),
                send_user: user.clone(),
                session_type: 1,
                is_show: 1,
                is_top: 0,
            };
            unread_count_map.insert(user, chat_session);
        } else {
            let chat_session = chat_session.ok_or(anyhow!("未读消息计数失败"))?;
            chat_session.unread_count += 1;
            if chat_session.timestamp < text_quic_msg.timestamp {
                chat_session.timestamp = text_quic_msg.timestamp;
                chat_session.last_message = text_quic_msg.raw;
                chat_session.text_type = text_quic_msg.text_type;
                chat_session.nano_id = text_quic_msg.nano_id;
            }
        }
    }

    // 更新会话
    for (_, chat_session) in unread_count_map.iter() {
        info!("更新会话信息 {:?}", chat_session);
        update_chat_session_db(chat_session).await?;
    }

    Ok(())
}

/// 启动定时已读任务
pub async fn start_read_task() -> Result<tokio::task::JoinHandle<()>, anyhow::Error> {
    let handle = tokio::spawn(async move {
        let uuid = get_user_info(&"uuid".to_string())
            .await
            .expect("获取uuid失败");

        let mut timestamp = 0;
        loop {
            let last_chat_record = query_last_read_msg(&uuid, timestamp)
                .await
                .expect("获取会话失败");
            if !last_chat_record.is_empty() {
                let mut read_record_vec: Vec<AddReadChatRecord> = Vec::new();
                for item in last_chat_record {
                    if item.timestamp > timestamp {
                        timestamp = item.timestamp;
                    }
                    let read_record = AddReadChatRecord {
                        nano_id: item.nano_id,
                        timestamp: item.timestamp,
                        send_user: item.send_user,
                        recv_user: item.recv_user,
                    };
                    read_record_vec.push(read_record);
                }

                info!("发送已读消息 {:?}", read_record_vec);

                match post_request(
                    format!("{}/msg/add_read_chat_record", TALK_API),
                    serde_json::to_string(&read_record_vec).expect("序列化已读消息失败"),
                )
                .await
                {
                    Ok(m) => {
                        info!("发送已读消息成功 {:?}", m.body)
                    }
                    Err(e) => {
                        error!("发送已读消息失败 {:?}", e);
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
    Ok(handle)
}

/// 获取未读通知
async fn get_unread_notification() -> Result<(), anyhow::Error> {
    let url = format!("{}/notify/get_user_unread_notification", TALK_API);
    let result = post_request(url, String::new())
        .await
        .map_err(|e| anyhow!(e))?;
    let data = result.body;
    let result = serde_json::from_str::<HttpResult>(&data)?;
    if result.code != 200 {
        error!("获取未读通知失败 {}", result.message);
        return Ok(());
    }
    let system_notification_vec: Vec<SystemNotification> = serde_json::from_value(result.data)?;
    info!("获取未读通知结果 {:?}", system_notification_vec);

    if system_notification_vec.is_empty() {
        return Ok(());
    }

    for system_notification in system_notification_vec {
        match SystemNotification::insert(&system_notification).await {
            Ok(_) => {}
            Err(e) => {
                warn!("插入系统通知失败 {}", e.to_string());
                continue;
            }
        }
    }
    Ok(())
}
