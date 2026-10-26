use std::time::Duration;

use log::error;
use tokio::time::timeout;

use crate::models::entity::chat_record_send::ChatRecordSend;
use crate::models::entity::Page;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::chat_service::{
    delete_chat_record_service, delete_group_chat_record_service, forward_chat_messages_service,
    get_chat_record_by_type_service, get_chat_record_service, get_group_chat_record_service,
    get_pending_send_records_service, ignore_send_msg_service, mark_read_service,
    recall_chat_message_service, recall_group_chat_message_service, retry_send_msg_service,
    send_call_control_msg_service, send_file_msg_service, send_group_file_msg_service,
    send_group_image_msg_service, send_group_text_msg_service, send_group_voice_msg_service,
    send_image_msg_service, send_self_text_msg_service, send_text_msg_service,
    send_voice_msg_service, send_webrtc_signal_service, update_group_last_read_msg_service,
};
use crate::GLOBAL_MSG_SEND_LOCK;

/// 发送文本消息
#[tauri::command]
pub async fn send_text_msg(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    // 获取全局消息发送锁，保证数据库最新消息，超过10秒后获取不到锁就返回错误
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        let res = send_text_msg_service(text_quic_msg).await;
        res
    })
    .await;
    match result {
        Ok(Ok(_)) => Ok("success".to_string()),
        Ok(Err(e)) => {
            error!("获取锁时发生意外错误,{}", e);
            Err(e.to_string())
        }
        Err(elapsed) => {
            error!("超时：10秒内未能获取锁 {}", elapsed);
            Err("获取锁超时".to_string())
        }
    }
}

/// 自己给自己发文本消息（纯本地：不经过服务端，避免 self-echo 回推导致重复渲染）
#[tauri::command]
pub async fn send_self_text_msg(text_quic_msg: TextQuicMsgVo) -> Result<TextQuicMsgVo, String> {
    send_self_text_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

/// 发送 WebRTC 信令消息（独立通道，不走 send/ack 表）
#[tauri::command]
pub async fn send_webrtc_signal(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    send_webrtc_signal_service(text_quic_msg).await.map_err(|e| e.to_string())
}

/// 发送视频通话控制消息（12-15，独立通道）
///
/// 自动生成一条 type=1 文本历史记录（prev_id 链、三方存储），
/// 控制命令本身只转发不存储、失败不重发。
#[tauri::command]
pub async fn send_call_control_msg(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        send_call_control_msg_service(text_quic_msg).await
    })
    .await;
    match result {
        Ok(Ok(_)) => Ok("success".to_string()),
        Ok(Err(e)) => {
            error!("发送通话控制消息失败,{}", e);
            Err(e.to_string())
        }
        Err(elapsed) => {
            error!("超时：10秒内未能获取锁 {}", elapsed);
            Err("获取锁超时".to_string())
        }
    }
}

/// 发送群聊文本消息（无锁机制）
#[tauri::command]
pub async fn send_group_text_msg(text_quic_msg: TextQuicMsgVo) -> Result<String, String> {
    send_group_text_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

/// 发送群聊图片消息（无锁机制）
#[tauri::command]
pub async fn send_group_image_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_group_image_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

/// 发送群聊文件消息（无锁机制）
#[tauri::command]
pub async fn send_group_file_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_group_file_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

/// 发送群聊语音消息（无锁机制）。`duration` 为录音时长(秒)。
#[tauri::command]
pub async fn send_group_voice_msg(
    text_quic_msg: TextQuicMsgVo,
    duration: i32,
) -> Result<(), String> {
    send_group_voice_msg_service(text_quic_msg, duration).await.map_err(|e| e.to_string())
}

// 发送图片数据
#[tauri::command]
pub async fn send_image_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_image_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

// 发送文件数据
#[tauri::command]
pub async fn send_file_msg(text_quic_msg: TextQuicMsgVo) -> Result<(), String> {
    send_file_msg_service(text_quic_msg).await.map_err(|e| e.to_string())
}

// 发送语音数据(单聊)。`duration` 为录音时长(秒)。
#[tauri::command]
pub async fn send_voice_msg(text_quic_msg: TextQuicMsgVo, duration: i32) -> Result<(), String> {
    send_voice_msg_service(text_quic_msg, duration).await.map_err(|e| e.to_string())
}

/// 已读当前记录
#[tauri::command]
pub async fn mark_read(text_quic_msg_vec: Vec<String>) -> Result<(), String> {
    mark_read_service(text_quic_msg_vec).await.map_err(|e| e.to_string())
}

/// 获取本地的聊天数据
#[tauri::command]
pub async fn get_chat_record_from_store(
    text_quic_msg: TextQuicMsgVo,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, String> {
    get_chat_record_service(text_quic_msg, page).await.map_err(|e| e.to_string())
}

/// 按消息类型获取本地的聊天数据（用于图片预览等场景）
#[tauri::command]
pub async fn get_chat_record_by_type(
    text_quic_msg: TextQuicMsgVo,
    text_type: u16,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, String> {
    get_chat_record_by_type_service(text_quic_msg, text_type, page).await.map_err(|e| e.to_string())
}

/// 获取群聊的本地聊天数据
#[tauri::command]
pub async fn get_group_chat_record_from_store(
    group_id: String,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, String> {
    get_group_chat_record_service(group_id, page).await.map_err(|e| e.to_string())
}

/// 群消息已读
#[tauri::command]
pub async fn mark_group_read(
    group_uuid: String,
    nano_id: String,
    timestamp: i64,
) -> Result<(), String> {
    update_group_last_read_msg_service(group_uuid, nano_id, timestamp)
        .await
        .map_err(|e| e.to_string())
}

/// 获取某好友的待发送记录（0-排队中，1-发送中，2-发送失败）
#[tauri::command]
pub async fn get_pending_send_records(recv_user: String) -> Result<Vec<ChatRecordSend>, String> {
    get_pending_send_records_service(recv_user).await.map_err(|e| e.to_string())
}

/// 手动重发失败消息（重置为排队并触发补发，加锁防并发）
#[tauri::command]
pub async fn retry_send_msg(send_id: String) -> Result<(), String> {
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        retry_send_msg_service(&send_id).await
    })
    .await;
    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => {
            error!("重发消息失败: {}", e);
            Err(e.to_string())
        }
        Err(elapsed) => {
            error!("重发消息超时：10秒内未能获取锁 {}", elapsed);
            Err("获取锁超时".to_string())
        }
    }
}

/// 忽略失败消息（状态置 -1，查询 IN(0,1,2) 不再返回，加锁防并发）
#[tauri::command]
pub async fn ignore_send_msg(send_id: String) -> Result<(), String> {
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        ignore_send_msg_service(&send_id).await
    })
    .await;
    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => {
            error!("忽略消息失败: {}", e);
            Err(e.to_string())
        }
        Err(elapsed) => {
            error!("忽略消息超时：10秒内未能获取锁 {}", elapsed);
            Err("获取锁超时".to_string())
        }
    }
}

/// 本机软删除单聊聊天记录（deleted 置 1，不通知服务端）
#[tauri::command]
pub async fn delete_chat_record(nano_id_list: Vec<String>) -> Result<(), String> {
    delete_chat_record_service(nano_id_list).await.map_err(|e| e.to_string())
}

/// 本机软删除群聊聊天记录（deleted 置 1，不通知服务端）
#[tauri::command]
pub async fn delete_group_chat_record(
    nano_id_list: Vec<String>,
    group_id: String,
) -> Result<(), String> {
    delete_group_chat_record_service(nano_id_list, group_id).await.map_err(|e| e.to_string())
}

/// 逐条转发消息到目标（好友或群）。
/// 图片/文件/语音复用原文件，但会先请求服务端为目标重新签发 biz_id（不重新上传）。
#[tauri::command]
pub async fn forward_chat_messages(
    messages: Vec<TextQuicMsgVo>,
    target_recv: String,
    target_group: bool,
) -> Result<(), String> {
    let result = timeout(Duration::from_secs(30), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        forward_chat_messages_service(messages, &target_recv, target_group).await
    })
    .await;
    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => {
            error!("转发消息失败: {}", e);
            Err(e.to_string())
        }
        Err(elapsed) => {
            error!("转发消息超时：30秒内未完成 {}", elapsed);
            Err("转发超时".to_string())
        }
    }
}

/// 撤回单聊消息（伪撤回）：清除本机原消息并发送撤回控制消息
#[tauri::command]
pub async fn recall_chat_message(
    recv_user: String,
    target_nano_id: String,
) -> Result<TextQuicMsgVo, String> {
    let result = timeout(Duration::from_secs(10), async {
        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        recall_chat_message_service(recv_user, target_nano_id).await
    })
    .await;
    match result {
        Ok(Ok(msg)) => Ok(msg),
        Ok(Err(e)) => {
            error!("撤回单聊消息失败: {}", e);
            Err(e.to_string())
        }
        Err(elapsed) => {
            error!("撤回单聊消息超时：10秒内未完成 {}", elapsed);
            Err("撤回超时".to_string())
        }
    }
}

/// 撤回群聊消息（伪撤回）：清除本机原消息并发送撤回控制消息
#[tauri::command]
pub async fn recall_group_chat_message(
    group_id: String,
    target_nano_id: String,
) -> Result<TextQuicMsgVo, String> {
    recall_group_chat_message_service(group_id, target_nano_id).await.map_err(|e| e.to_string())
}
