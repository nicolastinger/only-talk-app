use std::time::Duration;
use log::{error, info};
use tokio::time::timeout;
use crate::dao::chat_record_db::{
    query_chat_record_by_id_from_db, query_chat_record_from_db,
};
use crate::entity::p2p_models::{P2pInitMsg, P2pVideoData};
use crate::entity::system_notification::SystemNotification;
use crate::entity::Page;
use crate::quic_service::p2p_service::p2p_quic_service::LOG_SENDER;
use crate::quic_service::udp_utils::send_udp_ping_msg;
use crate::service::chat_service::{create_chat_session_service, get_chat_session_service, send_text_msg_service, update_last_read_msg_from_db, update_last_read_msg_service};
use crate::service::p2p_service::{
    access_p2p_request, find_available_udp_port, reject_p2p_request,
    send_p2p_init_msg as send_p2p_init_msg_service, send_p2p_video_config_service,
    send_p2p_video_frame_service,
};
use crate::service::user_service::get_user_info;
use crate::utils::global_static_str::UDP_SOCKET;
use crate::vo::chat_session_vo::ChatSessionVo;
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{GLOBAL_MSG_SEND_LOCK};

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
    send_udp_ping_msg(addr, UDP_SOCKET.to_string()).await.map_err(|e| e.to_string())?;

    Ok(format!("127.0.0.1:{}", udp_port))
}

/// 接受或者拒绝p2p请求
#[tauri::command]
pub async fn process_init_p2p_request(p2p_init_msg: String) -> Result<String, String> {
    info!("process init {}", p2p_init_msg);
    let mut p2p_init_msg =
        serde_json::from_str::<P2pInitMsg>(&p2p_init_msg).map_err(|e| e.to_string())?;
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
    let p2p_video_data = P2pVideoData { uuid, video_data: frame_data };
    {
        LOG_SENDER.lock().await.send(p2p_video_data).await.map_err(|e| e.to_string())?;
    }
    info!("发送完成");
    Ok(())
}

/// 获取本地的聊天数据
#[tauri::command]
pub async fn get_chat_record_from_store(
    text_quic_msg: TextQuicMsgVo,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, String> {
    query_chat_record_from_db(text_quic_msg, page).await.map_err(|e| e.to_string())
}

/// 获取会话列表
#[tauri::command]
pub async fn get_chat_session_from_store() -> Result<Vec<ChatSessionVo>, String> {
    get_chat_session_service().await.map_err(|e| e.to_string())
}

/// 发送文本消息
#[tauri::command]
pub async fn send_text_msg(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    // 获取全局消息发送锁，保证数据库最新消息，超过10秒后获取不到锁就返回错误
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        let res = send_text_msg_service(text_quic_msg).await;
        res
    }).await;
    match result {
        Ok(Ok(_)) => Ok("success".to_string()),
        Ok(Err(e)) => {
            error!("获取锁时发生意外错误,{}", e);
            Err(e.to_string())
        },
        Err(elapsed) => {
            error!("超时：10秒内未能获取锁 {}", elapsed);
            Err("获取锁超时".to_string())
        }
    }
}

/// 已读当前记录
#[tauri::command]
pub async fn mark_read(text_quic_msg_vec: Vec<String>) -> Result<(), String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let mut last_msg_vec: Vec<TextQuicMsgVo> = vec![];
    for item in text_quic_msg_vec {
        let text_quic_msg =
            query_chat_record_by_id_from_db(&item, &me).await.map_err(|e| e.to_string())?;
        last_msg_vec.push(text_quic_msg);
    }

    update_last_read_msg_from_db(last_msg_vec).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 已读当前会话
#[tauri::command]
pub async fn mark_read_chat_session(friend_uuid: String) -> Result<(), String> {
    update_last_read_msg_service(friend_uuid).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 创建一个聊天窗口
#[tauri::command]
pub async fn create_chat_session(friend_uuid: String) -> Result<(), String> {
    create_chat_session_service(friend_uuid).await.map_err(|e| e.to_string())
}

/// 获取系统通知信息
#[tauri::command]
pub async fn get_system_notification(
    is_read: Option<i32>,
) -> Result<Vec<SystemNotification>, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let res =
        SystemNotification::find_all_by_is_read(&me, is_read).await.map_err(|e| e.to_string())?;
    Ok(res)
}

/// 已读系统通知信息
#[tauri::command]
pub async fn batch_read_system_notification(read_ids: Vec<String>) -> Result<i32, String> {
    let me = get_user_info("uuid").await.map_err(|e| e.to_string())?;
    let res = SystemNotification::batch_read(&me, read_ids).await.map_err(|e| e.to_string())?;
    Ok(res)
}
