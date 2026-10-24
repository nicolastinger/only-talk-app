use std::time::Duration;

use anyhow::anyhow;
use log::info;
use quinn::Connection;

use crate::dao::chat_record_ack::{
    insert_chat_record_ack, query_chat_record_by_send_id, update_chat_record_ack_prev_id,
};
use crate::dao::chat_record_db::insert_chat_record;
use crate::dao::chat_record_send::{
    insert_chat_record_send, query_chat_record_send_by_user, query_record_send_from_db,
    update_chat_record_send, update_chat_record_send_status,
};
use crate::dao::session_db::update_chat_session_db;
use crate::models::entity::chat_record_ack::ChatRecordAck;
use crate::models::entity::chat_record_raw::{
    ChatRecordRaw, FileRecord, ImageRecord, TextRecord, VoiceRecord,
};
use crate::models::entity::chat_record_send::ChatRecordSend;
use crate::models::entity::chat_session::ChatSession;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::quic_core::center_service::text_msg_service::generate_text_msg_without_nano;
use crate::service::chat_service::emit_chat_session_event;
use crate::service::send_queue;
use crate::service::user_service::get_user_info;
use crate::utils::global_static_str::{PLATFORM, ZERO_UUID};
use crate::utils::message_lifecycle::{CallControlLifecycle, MessageLifecycle};
use crate::utils::message_types::{
    MSG_TYPE_P2P_VIDEO_CALL_ACCEPT, MSG_TYPE_P2P_VIDEO_CALL_END, MSG_TYPE_P2P_VIDEO_CALL_INVITE,
    MSG_TYPE_P2P_VIDEO_CALL_REJECT, MSG_TYPE_RECALL, MSG_TYPE_TEXT, MSG_TYPE_VOICE,
};
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::GLOBAL_QUIC_SERVER_LIST;

/// 按需开流发送文本信息
pub async fn send_msg(text_msg: Vec<u8>, conn: &Connection) -> Result<String, anyhow::Error> {
    // 整体 5 秒超时：断网/连接异常时 quinn 的 open_uni/write_all/finish 可能长时间挂起，
    // 会卡住 GLOBAL_MSG_SEND_LOCK 导致其他命令（重发/忽略）获取锁超时
    let send_future = async {
        let mut send = conn.open_uni().await?;
        send.write_all(&text_msg).await?;
        send.finish().await?;
        Ok("success".to_string())
    };
    match tokio::time::timeout(Duration::from_secs(5), send_future).await {
        Ok(result) => result,
        Err(_) => Err(anyhow!("发送消息超时")),
    }
}

/// 发送文本/图片/文件消息（TextLifecycle）
///
/// 通话控制消息(12-15)请走 send_call_control_msg，WebRTC 信令(100)请走 send_webrtc_signal。
pub async fn send_text_msg_service(text_quic_msg: TextQuicMsgVo) -> Result<String, anyhow::Error> {
    if CallControlLifecycle::matches(text_quic_msg.text_type) {
        return Err(anyhow!("通话控制消息(12-15)请使用 send_call_control_msg 命令"));
    }
    // 自己给自己发消息(笔记/文件传输助手)：没有对端，直接本地落库。
    // 走服务端的话这条消息会被回推给自己(self-echo)，同一条内容会出现两次。
    // 图片/文件/语音最终也汇聚到这里，因此统一在入口拦截。
    let sender = get_user_info("uuid").await?;
    if text_quic_msg.recv_user == sender {
        send_self_text_msg_service(text_quic_msg).await?;
        return Ok("success".to_string());
    }
    send_persistent_text_msg(text_quic_msg).await
}

/// 持久化消息发送（TextLifecycle）：计算 prev_id、写 chat_record_send/ack、
/// 直接发送或入队等待补发；失败自动重发（断连进入离线发送队列）。
pub async fn send_persistent_text_msg(
    text_quic_msg: TextQuicMsgVo,
) -> Result<String, anyhow::Error> {
    let sender = get_user_info("uuid").await?;
    let now = get_now_time_stamp_as_millis()?;

    let msg = text_quic_msg.raw;
    let mut prev_id = ZERO_UUID.to_string();

    // 查询本地最新一条已发送成功的消息
    let last_send_success_msg =
        query_chat_record_send_by_user(&sender, &text_quic_msg.recv_user, vec![3], false).await?;
    if !last_send_success_msg.is_empty() {
        let send_id = &last_send_success_msg
            .first()
            .ok_or(anyhow!("last_send_success_msg is empty"))?
            .send_id;
        if let Some(prev_ack) =
            query_chat_record_by_send_id(send_id, &text_quic_msg.recv_user).await?
        {
            prev_id = prev_ack.msg_id;
        }
    }

    let prev_id_clone = prev_id.clone();

    let msg_raw = set_prev_id(&msg, text_quic_msg.text_type, prev_id)?;

    let mut chat_record_send = ChatRecordSend {
        id: 0,
        send_id: text_quic_msg.nano_id.clone(),
        msg_id: "".to_string(),
        text_type: text_quic_msg.text_type,
        platform: PLATFORM,
        recv_user: text_quic_msg.recv_user,
        send_user: sender,
        timestamp: now,
        raw: msg_raw,
        send_status: 1,
        retry_count: 0,
    };

    // 检查当前接收用户，本地是否有未发送完成的消息
    let no_send_success_msg = query_chat_record_send_by_user(
        &chat_record_send.send_user,
        &chat_record_send.recv_user,
        vec![0, 1],
        true,
    )
    .await?;
    // 如果有，直接插入到本地发送表中，等待回调ack后发送或者定时任务检查发送
    if !no_send_success_msg.is_empty() {
        chat_record_send.send_status = 0;
        insert_chat_record_send(&chat_record_send).await?;
        let chat_record_ack = ChatRecordAck {
            id: 0,
            msg_id: "".to_string(),
            prev_id: "".to_string(),
            send_id: chat_record_send.send_id,
            platform: chat_record_send.platform,
            ack_status: 0,
            recv_user: chat_record_send.recv_user,
            send_user: chat_record_send.send_user,
            timestamp: now,
        };
        insert_chat_record_ack(&chat_record_ack).await?;
        return Ok("插入等待队列".to_string());
    }

    insert_chat_record_send(&chat_record_send).await?;
    let chat_record_ack = ChatRecordAck {
        id: 0,
        msg_id: "".to_string(),
        prev_id: prev_id_clone,
        send_id: chat_record_send.send_id,
        platform: chat_record_send.platform,
        ack_status: 0,
        recv_user: chat_record_send.recv_user,
        send_user: chat_record_send.send_user,
        timestamp: now,
    };
    insert_chat_record_ack(&chat_record_ack).await?;

    // 如果没有，则直接发送消息
    let raw: Vec<u8> = Vec::from(chat_record_send.raw);
    let send_id = chat_record_ack.send_id.clone();
    let test_msg = generate_text_msg_without_nano(
        text_quic_msg.text_type,
        raw,
        chat_record_ack.recv_user,
        chat_record_ack.send_user,
        chat_record_ack.send_id,
    )?;
    let conn = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").map(|c| c.conn.clone())
    };
    match conn {
        Some(conn) => send_msg(test_msg, &conn).await,
        None => {
            // 重连期间: 进入全局离线发送队列, 上线后自动补发; 手动断开(Idle)则报错
            if send_queue::should_queue_on_offline().await {
                send_queue::enqueue(send_id.clone(), test_msg).await;
                info!("[send_queue] QUIC 未连接，消息进入离线发送队列: {}", send_id);
                Ok("已进入离线发送队列".to_string())
            } else {
                Err(anyhow!("QUIC连接未建立，请稍后重试"))
            }
        }
    }
}

/// 自己给自己发文本消息（笔记 / 文件传输助手）：**纯本地**处理。
///
/// 这类消息没有"对端"：一旦走 QUIC，服务端会把它投递给接收者（也就是自己），
/// 同一内容既走 ACK 落库、又走 self-echo 回推落库，客户端就会把一条消息渲染多次。
/// 因此这里只做本地落库 + 会话置顶，并把落库后的消息原样返回给前端上屏。
pub async fn send_self_text_msg_service(
    mut text_quic_msg: TextQuicMsgVo,
) -> Result<TextQuicMsgVo, anyhow::Error> {
    let me = get_user_info("uuid").await?;
    if text_quic_msg.recv_user != me {
        return Err(anyhow!("该接口仅用于给自己发消息"));
    }

    // 服务端不下发这条消息，id / 发送者 / 时间戳都由本地确定
    text_quic_msg.nano_id = nanoid::nanoid!();
    text_quic_msg.send_user = me.clone();
    text_quic_msg.timestamp = get_now_time_stamp_as_millis()?;

    insert_chat_record(&text_quic_msg).await?;

    let session = ChatSession {
        id: 0,
        nano_id: text_quic_msg.nano_id.clone(),
        timestamp: text_quic_msg.timestamp,
        text_type: text_quic_msg.text_type,
        unread_count: 0,
        last_message: text_quic_msg.raw.clone(),
        recv_user: me.clone(),
        send_user: me.clone(),
        session_type: 1,
        is_show: 1,
        is_top: 0,
        group_id: None,
        session_uuid: None,
        last_message_id: 0,
    };
    update_chat_session_db(&session).await?;
    // 广播会话事件：会话列表实时置顶预览
    emit_chat_session_event(session.to_canonical(&me), 1).await?;

    Ok(text_quic_msg)
}

/// 通话控制消息(12-15) -> 文本历史记录文案（媒体区分语音/视频，默认视频）
fn call_control_text(text_type: u16, raw: &str) -> Result<Option<String>, anyhow::Error> {
    let media = serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|v| v.get("media").and_then(|m| m.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();
    let kind = if media == "audio" { "语音" } else { "视频" };
    let text = match text_type {
        MSG_TYPE_P2P_VIDEO_CALL_INVITE => format!("发起{}通话邀请", kind),
        MSG_TYPE_P2P_VIDEO_CALL_ACCEPT => format!("已接听{}通话", kind),
        MSG_TYPE_P2P_VIDEO_CALL_REJECT => format!("已拒绝{}通话", kind),
        MSG_TYPE_P2P_VIDEO_CALL_END => format!("{}通话已结束", kind),
        _ => return Ok(None),
    };
    Ok(Some(text))
}

/// 发送视频通话控制消息（CallControlLifecycle，12-15）
///
/// 1) 自动生成一条 type=1 文本记录（发起/已接听/已拒绝/已结束）走持久化文本管道
///    （prev_id、A/B 本地 sqlite + 服务端三方存储、可重发）；
/// 2) 控制命令本身直接经 SERVER_TEXT 上送：不进 send/ack 表、不落库、失败不重发，
///    服务端只转发不存储。
pub async fn send_call_control_msg_service(
    text_quic_msg: TextQuicMsgVo,
) -> Result<String, anyhow::Error> {
    if !CallControlLifecycle::matches(text_quic_msg.text_type) {
        return Err(anyhow!("send_call_control_msg 仅支持通话控制消息(12-15)"));
    }
    let sender = get_user_info("uuid").await?;

    // 1. 自动生成文本历史记录（type=1）
    if let Some(text) = call_control_text(text_quic_msg.text_type, &text_quic_msg.raw)? {
        let text_msg = TextQuicMsgVo {
            nano_id: nanoid::nanoid!(),
            text_type: MSG_TYPE_TEXT,
            raw: serde_json::json!({ "text": text, "prev_id": "", "platform": 0 }).to_string(),
            recv_user: text_quic_msg.recv_user.clone(),
            send_user: sender.clone(),
            timestamp: text_quic_msg.timestamp,
        };
        send_persistent_text_msg(text_msg).await?;
    }

    // 2. 直接上送控制命令（不重发、不落库）
    let raw = text_quic_msg.raw.as_bytes().to_vec();
    let test_msg = generate_text_msg_without_nano(
        text_quic_msg.text_type,
        raw,
        text_quic_msg.recv_user.clone(),
        sender,
        text_quic_msg.nano_id.clone(),
    )?;
    let conn = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("QUIC连接未建立，请稍后重试"))?.conn.clone()
    };
    send_msg(test_msg, &conn).await
}

/// 发送 WebRTC 信令消息（SignalLifecycle，独立通道）
///
/// 不走 send/ack 表、不设置 prev_id、不经发送锁，直接经 SERVER_TEXT 连接上送；
/// 服务端只转发不存储，客户端不落库、失败不重发（纯实时信令）。
pub async fn send_webrtc_signal_service(
    text_quic_msg: TextQuicMsgVo,
) -> Result<String, anyhow::Error> {
    let sender = get_user_info("uuid").await?;

    let raw: Vec<u8> = Vec::from(text_quic_msg.raw);
    let test_msg = generate_text_msg_without_nano(
        text_quic_msg.text_type,
        raw,
        text_quic_msg.recv_user,
        sender,
        text_quic_msg.nano_id,
    )?;

    let conn = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("QUIC连接未建立，请稍后重试"))?.conn.clone()
    };

    send_msg(test_msg, &conn).await
}

// 设置消息prev_id
pub fn set_prev_id(raw: &str, text_type: u16, prev_id: String) -> Result<String, anyhow::Error> {
    match text_type {
        1 => {
            let mut chat_record_raw = <TextRecord as ChatRecordRaw>::deserialize(raw)?;
            chat_record_raw.set_prev_id(prev_id);
            chat_record_raw.json_serialize()
        }
        2 => {
            let mut chat_record_raw = <ImageRecord as ChatRecordRaw>::deserialize(raw)?;
            chat_record_raw.set_prev_id(prev_id);
            chat_record_raw.json_serialize()
        }
        3 => {
            let mut chat_record_raw = <FileRecord as ChatRecordRaw>::deserialize(raw)?;
            chat_record_raw.set_prev_id(prev_id);
            chat_record_raw.json_serialize()
        }
        MSG_TYPE_VOICE => {
            let mut chat_record_raw = <VoiceRecord as ChatRecordRaw>::deserialize(raw)?;
            chat_record_raw.set_prev_id(prev_id);
            chat_record_raw.json_serialize()
        }
        // 视频通话控制消息（邀请/接受/拒绝/结束），不参与 prev_id 链
        12..=15 => Ok(raw.to_string()),
        // 消息撤回(伪撤回)控制消息不参与 prev_id 链
        MSG_TYPE_RECALL => Ok(raw.to_string()),
        _ => Err(anyhow!("不支持的消息类型: {}", text_type)),
    }
}

/// 重算 prev_id 并持久化：更新 ack 表 prev_id、重写 send 表 raw/状态/时间
/// 返回更新后的记录（含新 raw），供调用方直接发送
pub async fn prepare_pending_msg_for_send(
    item: &ChatRecordSend,
    new_status: i16,
    new_retry_count: i32,
) -> Result<ChatRecordSend, anyhow::Error> {
    let mut prev_id = ZERO_UUID.to_string();
    let sender = &item.send_user;
    let recv_user = &item.recv_user;
    // 查询本地最新一条已发送成功的消息
    let last_send_success_msg =
        query_chat_record_send_by_user(sender, recv_user, vec![3], false).await?;
    if !last_send_success_msg.is_empty() {
        let send_id = &last_send_success_msg
            .first()
            .ok_or(anyhow!("last_send_success_msg is empty"))?
            .send_id;
        if let Some(prev_ack) = query_chat_record_by_send_id(send_id, recv_user).await? {
            prev_id = prev_ack.msg_id;
        }
    }
    // 更新ack的prev_id
    update_chat_record_ack_prev_id(&item.send_id, &prev_id).await?;
    let msg_raw = set_prev_id(&item.raw, item.text_type, prev_id)?;
    let now = get_now_time_stamp_as_millis()?;
    // 持久化：raw 同步写回（修复重发后落库 prev_id 与线上不一致的 bug）
    update_chat_record_send(&item.send_id, "", new_status, new_retry_count, now, &msg_raw).await?;

    let mut updated = item.clone();
    updated.raw = msg_raw;
    updated.send_status = new_status;
    updated.retry_count = new_retry_count;
    updated.timestamp = now;
    Ok(updated)
}

/// 手动重发失败消息：重置为排队(0)，重算 prev_id/raw，触发补发
/// 调用方需持有 GLOBAL_MSG_SEND_LOCK
pub async fn retry_send_msg_service(send_id: &str) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let record = query_record_send_from_db(send_id).await?;
    if record.send_user != me {
        return Err(anyhow!("无权操作该消息"));
    }
    if record.send_status != 2 {
        return Err(anyhow!("消息状态已变化，无法重发"));
    }
    // 重入队：status=0, retry_count 清零（重发后重试机会从满额重新计算），raw 同步写回
    prepare_pending_msg_for_send(&record, 0, 0).await?;
    // 触发补发（内部裁决：同一接收方仅一条在途；未被选中则由定时任务兜底补发）
    process_no_send_success_msg().await?;
    Ok(())
}

/// 忽略失败消息：状态置 -1（已忽略），查询 IN(0,1,2) 不再返回
pub async fn ignore_send_msg_service(send_id: &str) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let record = query_record_send_from_db(send_id).await?;
    if record.send_user != me {
        return Err(anyhow!("无权操作该消息"));
    }
    if record.send_status != 2 {
        return Err(anyhow!("消息状态已变化，无法忽略"));
    }
    update_chat_record_send_status(send_id, -1).await?;
    Ok(())
}

// 处理本地未发送完成的消息
pub async fn process_no_send_success_msg() -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let recv_user = String::from("");
    let no_send_success_msg =
        query_chat_record_send_by_user(&me, &recv_user, vec![0, 1], true).await?;
    let now = get_now_time_stamp_as_millis()?;
    if !no_send_success_msg.is_empty() {
        info!("存在未发送完成的消息, 发送消息条数: {}", no_send_success_msg.len());
        let mut no_send_success_msg_option: Option<ChatRecordSend> = None;
        for mut item in no_send_success_msg {
            let status = item.send_status;
            let retry_count = item.retry_count;
            let timestamp = item.timestamp;
            let diff_time = now - timestamp;
            let send_user = &item.send_user;
            let recv_user = &item.recv_user;

            // 检查当前接收用户，本地是否有未发送完成的消息
            let no_send_success_msg =
                query_chat_record_send_by_user(send_user, recv_user, vec![1], true).await?;
            let mut no_send_success_time = 0i64;
            if !no_send_success_msg.is_empty() {
                no_send_success_time = no_send_success_msg
                    .first()
                    .ok_or(anyhow!("no_send_success_msg is empty"))?
                    .timestamp;
            }
            if status == 0
                && no_send_success_msg_option.is_none()
                && (no_send_success_msg.is_empty() || timestamp <= no_send_success_time)
            {
                no_send_success_msg_option = Some(item);
                continue;
            }
            if status == 1
                && no_send_success_msg_option.is_none()
                && retry_count < 3
                && diff_time > 8000
                && (no_send_success_msg.is_empty() || timestamp <= no_send_success_time)
            {
                no_send_success_msg_option = Some(item);
                continue;
            }
            if status == 1 && retry_count >= 3 {
                item.send_status = 2;
                update_chat_record_send(&item.send_id, "", 2, 3, now, &item.raw).await?;
            }
        }
        if let Some(item) = no_send_success_msg_option {
            info!("存在未发送完成的消息, 发送消息: {}", item.send_id);
            let retry_count = item.retry_count + 1;
            // 重算 prev_id、重写 raw 并持久化（raw 同步修复）
            let updated = prepare_pending_msg_for_send(&item, 1, retry_count).await?;

            let raw: Vec<u8> = Vec::from(updated.raw);
            let test_msg = generate_text_msg_without_nano(
                updated.text_type,
                raw,
                updated.recv_user,
                updated.send_user,
                updated.send_id,
            )?;
            let conn = {
                let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
                match server_book.get("SERVER_TEXT") {
                    Some(c) => c.conn.clone(),
                    None => {
                        info!("QUIC 未连接，跳过补发，等待重连后下一轮");
                        return Ok(());
                    }
                }
            };

            send_msg(test_msg, &conn).await?;
        }
    }

    Ok(())
}
