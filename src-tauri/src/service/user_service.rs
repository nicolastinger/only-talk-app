use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::Duration;

use anyhow::anyhow;
use log::{error, info, warn};
use tokio::time::timeout;

use crate::cmd::api_controller::post_request;
use crate::dao::chat_record_db::{insert_chat_record, query_last_read_msg};
use crate::dao::init_db::init_sqlite;
use crate::dao::init_private_db::init_private_db;
use crate::dao::session_db::update_chat_session_db;
use crate::dto::add_read_chat_record::AddReadChatRecord;
use crate::dto::http_result::HttpResult;
use crate::entity::chat_session::ChatSession;
use crate::entity::system_notification::SystemNotification;
use crate::entity::text_msg::TextQuicMsg;
use crate::quic_service::center_service::text_quic_client::run_client;
use crate::service::chat_service::process_no_send_success_msg;
use crate::service::friend_service::update_friend_list;
use crate::utils::dns::resolve_ipv4;
use crate::utils::global_static_str::{DOMAIN_NAME, TALK_API};
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{GLOBAL_MSG_SEND_LOCK, GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

/// 用户登录执行操作
pub async fn user_login() -> Result<(), anyhow::Error> {
    info!("用户登录开始");
    // 初始化数据库
    init_sqlite().await.expect("初始化数据库失败!");
    // 初始化私有数据库
    init_private_db().await.expect("初始化私有数据库失败");
    //1、获取好友列表
    update_friend_list().await.unwrap_or_else(|e| {
        error!("获取好友列表失败 {:?}", e);
    });
    //2、获取未读消息
    get_unread_message().await.unwrap_or_else(|e| error!("获取未读消息失败 {:?}", e));
    //3、获取未读通知
    get_unread_notification().await.unwrap_or_else(|e| error!("获取未读通知失败 {:?}", e));
    //启动quic服务
    tokio::spawn(async move {
        let addr = resolve_ipv4(DOMAIN_NAME, 4433).await.expect("解析域名失败");
        run_client(SocketAddr::from(addr)).await.expect("quic服务启动失败");
    });
    //启动定时任务
    tokio::spawn(async move {
        start_read_task().await.unwrap_or_else(|e| error!("启动定时任务失败 {:?}", e));
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
    GLOBAL_QUIC_USER_INFO.write().await.insert(key.to_string(), value.to_string());
    Ok(())
}

/// 获取未读消息
pub async fn get_unread_message() -> Result<(), anyhow::Error> {
    let url = format!("{}/msg/get_unread_chat_record", TALK_API);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;

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
    let uuid = get_user_info("uuid").await?;

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
pub async fn start_read_task() -> Result<(), anyhow::Error> {
    tokio::time::sleep(Duration::from_secs(10)).await;
    let schedule_key = uuid::Uuid::new_v4().to_string();
    // 设置定时任务key
    insert_user_info("schedule_key", &schedule_key).await?;
    info!("定时任务key: {}, 启动", schedule_key);

    let read_task_key = schedule_key.clone();
    // 用户消息已读任务
    tokio::spawn(async move {
        send_read_message(read_task_key).await.expect("消息已读任务失败");
    });
    let mut count = 0;
    while count < 1000000 {
        // 校验定时任务key
        check_schedule_key(&schedule_key).await?;
        count += 1;

        // 处理未发送消息
        tokio::spawn(async move {
            // 处理未发送消息
            timeout(Duration::from_secs(10), async {
                let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
                process_no_send_success_msg().await.expect("处理未发送消息失败");
            })
            .await
            .expect("定时任务，处理未发送消息超时");
        });

        // 20秒触发一次
        if count % 2 == 0 {}

        // 30秒触发一次
        if count % 3 == 0 {}

        tokio::time::sleep(Duration::from_secs(10)).await;
    }
    info!("定时任务结束");
    Ok(())
}

// 校验定时任务key
pub async fn check_schedule_key(key: &str) -> Result<(), anyhow::Error> {
    let schedule_key = get_user_info("schedule_key").await;
    match schedule_key {
        Ok(schedule_key) => {
            if key != schedule_key {
                return Err(anyhow!("定时任务key不匹配"));
            }
        }
        Err(err) => {
            error!("获取定时任务key失败 {:?}", err);
            return Err(err);
        }
    }
    Ok(())
}

// 发送已读消息
pub async fn send_read_message(key: String) -> Result<(), anyhow::Error> {
    let uuid = get_user_info("uuid").await?;

    let mut timestamp = 0;
    let mut count = 0;
    while count < 1000000 {
        // 校验定时任务key
        check_schedule_key(&key).await?;
        let last_chat_record = query_last_read_msg(&uuid, timestamp).await?;
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
        count += 1;
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
    Ok(())
}

/// 获取未读通知
async fn get_unread_notification() -> Result<(), anyhow::Error> {
    let url = format!("{}/notify/get_user_unread_notification", TALK_API);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
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
                warn!("插入系统通知失败 {}", e);
                continue;
            }
        }
    }
    Ok(())
}

pub async fn get_user_map(key: &str) -> Result<String, String> {
    Ok(GLOBAL_QUIC_USER_INFO.read().await.get(key).cloned().ok_or("not found")?.to_string())
}

pub async fn add_user_map(key: &str, value: &str) -> Result<(), String> {
    GLOBAL_QUIC_USER_INFO.write().await.insert(key.to_string(), value.to_string());
    Ok(())
}

/// 断开QUIC连接
/// 清理所有QUIC连接资源，包括文本连接和P2P连接
pub async fn disconnect_quic() -> Result<(), anyhow::Error> {
    info!("开始断开QUIC连接");
    
    // 清除服务器连接列表
    {
        let mut server_list = GLOBAL_QUIC_SERVER_LIST.write().await;
        server_list.clear();
        info!("已清理QUIC服务器连接列表");
    }
    
    // 标记用户离线状态
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("quic_disconnected".to_string(), "true".to_string());
        info!("已标记QUIC断开状态");
    }
    
    info!("QUIC连接已断开");
    Ok(())
}

/// 重新连接QUIC服务
/// 重新建立与服务器的QUIC连接
pub async fn reconnect_quic() -> Result<(), anyhow::Error> {
    info!("开始重新连接QUIC服务");
    
    // 先断开现有连接
    disconnect_quic().await?;
    
    // 清除断开状态标记
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("quic_disconnected".to_string(), "false".to_string());
    }
    
    // 重新启动QUIC客户端
    let addr = resolve_ipv4(DOMAIN_NAME, 4433).await?;
    tokio::spawn(async move {
        match run_client(SocketAddr::from(addr)).await {
            Ok(_) => info!("QUIC重连成功"),
            Err(e) => error!("QUIC重连失败: {}", e),
        }
    });
    
    info!("QUIC重连请求已发送");
    Ok(())
}
