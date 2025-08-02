use std::collections::HashMap;
use anyhow::anyhow;
use log::{error, info};
use serde_json::Value;
use crate::GLOBAL_QUIC_USER_INFO;
use crate::models::text_msg::TextQuicMsg;
use crate::network::http_utils::post_request;
use crate::quic_module::text_quic_client::run_client;
use crate::store::chat_record_db::insert_chat_record;
use crate::utils::global_static_str::{QUIC_SERVER_ADDR, TALK_API};
use crate::vo::text_quic_msg::TextQuicMsgVo;

// 验证uuid和token
pub async fn verify_token(uuid: &String, token: &String)-> Result<bool, anyhow::Error>{

    Ok(true)
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

/// 用户登录执行操作
pub async fn user_login()-> Result<(), anyhow::Error>{
    //1、启动quic服务
    let addr = QUIC_SERVER_ADDR.parse()?;
    tokio::spawn(async move{
        match run_client(addr).await  {
            Ok(_) => {},
            Err(e) => {
                error!("创建quic客户端失败 {:?}", e);
            }
        }
    });
    //2、好友列表本地缓存对比服务器
    //3、获取未读消息
    tokio::spawn(async move{
        get_unread_message().await.expect("获取未读消息失败");
    });

    //4、获取好友请求信息
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
    for text_quic_msg in text_quic_msg_vec {
        //保存未读消息
        match insert_chat_record(text_quic_msg).await {  
            Ok(_) => {},
            Err(e) => {
                error!("保存未读消息失败 {:?}", e);
            }
        }
    }
    
    Ok(())
}