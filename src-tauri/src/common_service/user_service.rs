use std::collections::HashMap;
use anyhow::anyhow;
use serde_json::Value;
use crate::GLOBAL_QUIC_USER_INFO;
use crate::network::http_utils::post_request;
use crate::utils::global_static_str::TALK_API;

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