use std::collections::HashMap;
use anyhow::anyhow;
use log::{error, info};
use uuid::Uuid;
use serde_json::Value;
use crate::{GLOBAL_QUIC_USER_INFO};
use crate::dto::add_read_chat_record::AddReadChatRecord;
use crate::models::chat_session::ChatSession;
use crate::models::friend::Friend;
use crate::models::text_msg::TextQuicMsg;
use crate::network::http_utils::post_request;
use crate::quic_module::text_quic_client::run_client;
use crate::store::chat_record_db::{insert_chat_record, query_friend_info, query_last_read_msg, update_chat_session, update_friend_info};
use crate::utils::global_static_str::{QUIC_SERVER_ADDR, TALK_API};
use crate::vo::friend_vo::FriendListVO;
use crate::vo::http_response::Response;
use crate::vo::text_quic_msg::TextQuicMsgVo;


/// 用户登录执行操作
pub async fn user_login()-> Result<(), anyhow::Error>{
    //1、获取好友列表
    update_friend_list().await.unwrap_or_else(|e| { error!("获取好友列表失败 {:?}", e); });
    //2、获取未读消息
    get_unread_message().await.unwrap_or_else(|e| { error!("获取未读消息失败 {:?}", e)});
    //3、获取好友请求信息
    
    //4、启动定时已读任务
    start_read_task().await?;

    //启动quic服务
    let addr = QUIC_SERVER_ADDR.parse()?;
    tokio::spawn(async move{
        match run_client(addr).await  {
            Ok(_) => {},
            Err(e) => {
                error!("创建quic客户端失败 {:?}", e);
            }
        }
    });
    Ok(())
}

/// 获取用户信息
pub async fn get_user_info(key: &String)-> Result<String, anyhow::Error>{
    let guard = GLOBAL_QUIC_USER_INFO.read().await;
    match guard.get(key){
        Some(value) => Ok(value.clone()),
        None => Err(anyhow!("数据不存在"))
    }
}

/// 插入用户信息
pub async fn insert_user_info(key: &String, value: &String)-> Result<(), anyhow::Error>{
    GLOBAL_QUIC_USER_INFO.write().await.insert(key.to_string(), value.to_string());
    Ok(())
}

/// 获取好友列表
pub async fn update_friend_list()-> Result<(), anyhow::Error>{
    // 获取本地最新update的好友
    let uuid = get_user_info(&"uuid".to_string()).await?;
    let res = query_friend_info(&uuid).await?;
    let mut last_uuid = Uuid::now_v7().to_string();
    let mut last_version = 0;
    if !res.is_empty() { 
        let last_update_friend = res.into_iter().max_by_key(|f| f.updated_at);
        // 现在last_update_friend是按updated_at倒序的最后一条记录
        if last_update_friend.is_some() {
            let last_update_friend = last_update_friend.unwrap();
            last_uuid = last_update_friend.friend_id;
            last_version = last_update_friend.version;
        }
    }
    let url = format!("{}/friend/get_friend/{}/{}", TALK_API, &last_uuid, last_version);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;

    let data = result.body;
    info!("获取好友列表结果 {:?}", data);
    let response: Response = serde_json::from_str(&data)?;
    
    // 处理不同类型的响应数据
    match response.data {
        Some(Value::Array(arr)) => {
            // 将数组中的每个元素分别转换为FriendListVO对象
            for item in arr {
                let friend_vo: FriendListVO = serde_json::from_value(item)?;

                let friend = Friend {
                    id: 0,
                    created_at: friend_vo.created_at,
                    updated_at: friend_vo.updated_at,
                    friend_id: friend_vo.uuid,
                    friend_account: friend_vo.account,
                    friend_name: friend_vo.username,
                    friend_icon: friend_vo.icon,
                    friend_info: friend_vo.info,
                    friend_status: 0,
                    me: uuid.clone(),
                    is_del: friend_vo.is_del,
                    is_block: 0,
                    is_mute: 0,
                    is_top: 0,
                    is_show: 1,
                    version: friend_vo.version,
                };
                update_friend_info(&friend).await.unwrap_or_else(|e| {error!("更新好友信息失败 {:?}", e)})
            }
            // TODO: 在这里处理好友列表，比如保存到数据库
        }
        _ => {
            // 无数据
            info!("无数据返回");
        }
    }

    Ok(())
}

/// 获取未读消息
pub async fn get_unread_message()-> Result<(), anyhow::Error>{
    let url = format!("{}/msg/get_unread_chat_record", TALK_API);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;

    let data = result.body;
    let json: Vec<TextQuicMsg> = serde_json::from_str(&data)?;
    let text_quic_msg_vec = TextQuicMsgVo::from_vec(json)?;
    info!("获取未读消息结果 {:?}", text_quic_msg_vec);
    // 未读消息计数
    let mut unread_count_map: HashMap<String, ChatSession> = HashMap::new();
    let uuid = get_user_info(&"uuid".to_string()).await?;

    for text_quic_msg in text_quic_msg_vec {
        //保存未读消息
        match insert_chat_record(&text_quic_msg).await {
            Ok(_) => {},
            Err(_) => {
                continue;
            }
        }
        let user = match text_quic_msg.recv_user == uuid {
            true => text_quic_msg.send_user.clone(),
            false => text_quic_msg.recv_user.clone()
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
        }else {
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
        update_chat_session(chat_session).await?;
    }

    Ok(())
}

/// 启动定时已读任务
pub async fn start_read_task()-> Result<(), anyhow::Error>{
    tokio::spawn(async move{
        let uuid = get_user_info(&"uuid".to_string()).await.expect("获取uuid失败");

        let mut timestamp = 0;
        loop {
            let last_chat_record = query_last_read_msg(&uuid, timestamp).await.expect("获取会话失败");
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
                        recv_user: item.recv_user
                    };
                    read_record_vec.push(read_record);
                }
                
                info!("发送已读消息 {:?}", read_record_vec);

                match post_request(format!("{}/msg/add_read_chat_record", TALK_API), serde_json::to_string(&read_record_vec).expect("序列化已读消息失败")).await  {
                    Ok(m) => {info!("发送已读消息成功 {:?}", m.body)},
                    Err(e) => {
                        error!("发送已读消息失败 {:?}", e);
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        }
    });
    Ok(())
}