use crate::common_service::p2p_service::{access_p2p_request, find_available_udp_port, reject_p2p_request, send_p2p_init_msg as send_p2p_init_msg_service, send_p2p_video_config_service, send_p2p_video_frame_service};
use crate::models::p2p_models::{P2pInitMsg, P2pVideoData};
use crate::quic_module::udp_utils::send_udp_ping_msg;
use crate::utils::global_static_str::{ UDP_SOCKET};
use crate::{GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};
use std::collections::HashMap;
use log::info;
use crate::common_service::chat_service::{clear_chat_session, get_chat_session_from_db, send_msg, update_last_read_msg_from_db};
use crate::common_service::user_service::get_user_info;
use crate::models::chat_session::ChatSession;
use crate::models::friend::Friend;
use crate::models::Page;
use crate::quic_module::p2p_quic_service::LOG_SENDER;
use crate::quic_module::text_msg_service::generate_text_msg_without_nano;
use crate::store::chat_record_db::{insert_local_ack_to_db, query_chat_record_by_id_from_db, query_chat_record_from_db, query_friend_info, query_friend_info_by_id};
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::vo::chat_session_vo::ChatSessionVo;
use crate::vo::friend_vo::FriendVo;
use crate::vo::text_quic_msg::TextQuicMsgVo;

/// 增加持久化数据
#[tauri::command]
pub async fn add_user_map(map: HashMap<String, String>) -> Result<String, String> {
    GLOBAL_QUIC_USER_INFO.write().await.extend(map.into_iter());
    Ok("success".to_string())
}

/// 获取持久化数据
#[tauri::command]
pub async fn get_user_map(key: String) -> Result<String, String> {
    Ok(GLOBAL_QUIC_USER_INFO
        .read()
        .await
        .get(&key)
        .cloned()
        .ok_or("not found")?
        .to_string())
}

/// 发送p2p请求给好友
#[tauri::command]
pub async fn send_p2p_init_msg(accept_user: String) -> Result<String, String> {
    info!("向 {} 发起p2p请求", accept_user);
    send_p2p_init_msg_service(accept_user).await.map_err(|e| e.to_string())?;
    Ok("success".to_string())
}

/// 给服务器发送udp请求，服务器记录ip端口
#[tauri::command]
pub async fn send_init_p2p_udp() -> Result<String, String> {
    let udp_port = find_available_udp_port(10024).ok_or("no available UDP port")?;
    let addr = format!("0.0.0.0:{}", udp_port);
    send_udp_ping_msg(addr, UDP_SOCKET.to_string())
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("127.0.0.1:{}", udp_port))
}

/// 接受或者拒绝p2p请求
#[tauri::command]
pub async fn process_init_p2p_request(p2p_init_msg: String) -> Result<String, String> {
    info!("process init {}", p2p_init_msg);
    let mut p2p_init_msg = serde_json::from_str::<P2pInitMsg>(&p2p_init_msg).map_err(|e| e.to_string())?;
    info!("接收到的p2p信息 {:?}", p2p_init_msg);
    match p2p_init_msg.accept {
        // 接受
        true => {
            p2p_init_msg.accept = true;
            p2p_init_msg.step = 2;
            access_p2p_request(p2p_init_msg).await.map_err(|e| e.to_string())?;
        }
        // 拒绝
        false => {
            p2p_init_msg.step = 1;
            reject_p2p_request(p2p_init_msg).await.map_err(|e| e.to_string())?;
        }
    }

    Ok("success".to_string())
}


/// 发送视频帧数据-无缓存
#[tauri::command]
pub async fn send_p2p_video_frame(frame_data: Vec<u8>, target_uuid: String) -> Result<(), String> {
    send_p2p_video_frame_service(frame_data, target_uuid).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// 发送视频配置
#[tauri::command]
pub async fn send_p2p_video_config(video_config: String, uuid: String) -> Result<(), String> {
    send_p2p_video_config_service(video_config, uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 发送视频帧数据-本地缓存
#[tauri::command]
pub async fn send_video_frame(frame_data: Vec<u8>, uuid: String) -> Result<(), String> {
    info!("帧大小 {}", frame_data.len());
    //直接发送帧数据到前端
    let p2p_video_data  = P2pVideoData {
        uuid,
        video_data: frame_data
    };
    {
        LOG_SENDER.lock().await.send(p2p_video_data).await.unwrap();
    }
    info!("发送完成");
    Ok(())
}

/// 获取本地的聊天数据
#[tauri::command]
pub async fn get_chat_record_from_store(text_quic_msg: TextQuicMsgVo, page: Page) -> Result<Vec<TextQuicMsgVo>, String> {
    Ok(query_chat_record_from_db(text_quic_msg, page).await.map_err(|e| e.to_string())?)
}

/// 获取会话列表
#[tauri::command]
pub async fn get_chat_session_from_store() -> Result<Vec<ChatSessionVo>, String> {
    Ok(get_chat_session_from_db().await.map_err(|e| e.to_string())?)
}

/// 发送文本消息
#[tauri::command]
pub async fn send_text_msg(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    let me = GLOBAL_QUIC_USER_INFO.read().await;
    let sender = me.get("uuid").ok_or("获取用户信息失败")?.clone();
    let now = get_now_time_stamp_as_millis().map_err(|e| e.to_string())?;
    
    let msg = text_quic_msg.raw;
    let ack_raw = msg.clone();
    let ack_recv = text_quic_msg.recv_user.clone().clone();
    let ack_me = sender.clone();
    let raw: Vec<u8> = Vec::from(msg);
    let ack_id = text_quic_msg.nano_id.clone();
    
    // 插入本地ack
    let text_msg_vo = TextQuicMsgVo {
        nano_id: ack_id,
        text_type: text_quic_msg.text_type,
        raw: ack_raw,
        recv_user: ack_recv,
        send_user: ack_me,
        timestamp: now,
    };
    insert_local_ack_to_db(text_msg_vo).await.map_err(|e| e.to_string())?;

    // 发送消息
    let test_msg = generate_text_msg_without_nano(
        text_quic_msg.text_type,
        raw,
        text_quic_msg.recv_user.clone(),
        sender,
        text_quic_msg.nano_id.clone()
    ).map_err(|e| e.to_string())?;
    let send_stream =
        {
            let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
            server_book.get("SERVER_TEXT").unwrap().send_stream.clone()
        };

    send_msg(test_msg, send_stream.clone()).await.map_err(|e| e.to_string())
}

/// 查询当前好友信息
#[tauri::command]
pub async fn get_friend_info(friend_uuid: String) -> Result<FriendVo, String> {
    let me = get_user_info(&"uuid".to_string()).await.map_err(|e| e.to_string())?;
    let friend = query_friend_info_by_id(&me, &friend_uuid).await.map_err(|e| e.to_string())?;
    let friend_vo = FriendVo::from(friend);
    Ok(friend_vo)
}

/// 查询好友列表
#[tauri::command]
pub async fn get_friend_list() -> Result<Vec<FriendVo>, String> {
    let me = get_user_info(&"uuid".to_string()).await.map_err(|e| e.to_string())?;
    let friends = query_friend_info(&me).await.map_err(|e| e.to_string())?;
    let mut friend_vec = vec![];
    for friend in friends {
        let friend_vo = FriendVo::from(friend);
        friend_vec.push(friend_vo);
    }
    Ok(friend_vec)
}

/// 已读当前记录
#[tauri::command]
pub async fn mark_read(text_quic_msg_vec: Vec<String>) -> Result<(), String> {
    let me = get_user_info(&"uuid".to_string()).await.map_err(|e| e.to_string())?;
    let mut last_msg_vec: Vec<TextQuicMsgVo> = vec![];
    for item in text_quic_msg_vec {
        let text_quic_msg = query_chat_record_by_id_from_db(&item, &me).await.map_err(|e| e.to_string())?;
        last_msg_vec.push(text_quic_msg);
    }

    update_last_read_msg_from_db(last_msg_vec).await.map_err(|e| e.to_string())?;
    Ok(())
}