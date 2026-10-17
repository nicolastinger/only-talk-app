#![cfg(test)]

//! 入站消息分发(`service::dispatcher`)集成测试。
//!
//! 通过捕获型 `utils::events` 端口断言「在正确时机发出正确事件」, 并用
//! `tests/common` 脚手架提供 user/private 库, 覆盖各消息类型的落库 + 事件路径。
//!
//! 所有用例串行执行(全局 emit 端口 + 全局连接池均为进程级)。

mod common;

use std::sync::{Mutex, OnceLock};

use app_lib::dao::chat_record_db::query_chat_record_by_id_from_db;
use app_lib::dao::chat_record_send::{insert_chat_record_send, query_record_send_from_db};
use app_lib::dao::friend_db::{set_block_friend_db, update_friend_info_db};
use app_lib::dao::group_chat_record_db::query_group_chat_record_from_db;
use app_lib::dao::group_message_ack::{
    insert_group_message_ack, query_group_message_ack_by_local_nano_id,
};
use app_lib::dao::session_db::query_chat_session_by_user_db;
use app_lib::models::bo::text_msg::TextQuicMsg;
use app_lib::models::entity::chat_record_send::ChatRecordSend;
use app_lib::models::entity::friend::Friend;
use app_lib::models::entity::group::Group;
use app_lib::models::entity::group_message_ack::GroupMessageAck;
use app_lib::service::dispatcher::process_msg;
use app_lib::service::user_service::{get_user_info, insert_user_info};
use app_lib::utils::events;
use app_lib::utils::global_static_str::SYSTEM;
use app_lib::GLOBAL_QUIC_USER_INFO;

use common::{with_private_db, with_user_and_private_db, with_user_db};

const ME: &str = "00000000-0000-0000-0000-000000000001";
const FRIEND: &str = "00000000-0000-0000-0000-000000000002";
const GROUP: &str = "00000000-0000-0000-0000-0000000000gg";

/// 消息类型常量(与 `utils::message_types` 对齐, 测试内固定值以免耦合)
const T_TEXT: u16 = 1;
const T_P2P: u16 = 4;
const T_CALL_INVITE: u16 = 12;
const T_JSON: u16 = 88;
const T_PING: u16 = 99;
const T_WEBRTC: u16 = 100;
const T_ACK: u16 = 201;
const T_NOTIFY: u16 = 1024;
const T_GROUP_TEXT: u16 = 2001;
const T_GROUP_ACK: u16 = 2201;
const T_RECALL: u16 = 3001;
const T_SYSTEM: u16 = 10001;
const T_FORCE_LOGOUT: u16 = 10002;

// ---------------- emit 捕获 ----------------

/// 捕获到的 (事件名, payload) 列表。
static EVENTS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());
static SINK: OnceLock<()> = OnceLock::new();

/// 串行化本文件所有用例。
static TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// 注册捕获型 emit 实现(仅首次生效)并清空历史事件。
async fn init_sink() {
    SINK.get_or_init(|| {
        events::register_emit(|event, payload| {
            EVENTS.lock().expect("锁定事件失败").push((event.to_string(), payload.to_string()));
            Ok(())
        });
    });
    EVENTS.lock().expect("锁定事件失败").clear();
}

fn take_events() -> Vec<(String, String)> {
    std::mem::take(&mut *EVENTS.lock().expect("锁定事件失败"))
}

fn has_event(events: &[(String, String)], name: &str) -> bool {
    events.iter().any(|(e, _)| e == name)
}

// ---------------- 辅助 ----------------

/// 清空并写入当前用户 uuid(handler 普遍依赖 `get_user_info("uuid")`)。
async fn seed_user(me: &str) {
    GLOBAL_QUIC_USER_INFO.write().await.clear();
    insert_user_info("uuid", me).await.expect("写入 uuid 失败");
}

fn text_msg(text_type: u16, raw: &str, recv: &str, send: &str) -> TextQuicMsg {
    TextQuicMsg {
        nano_id: format!("nano-{}", text_type),
        text_type,
        raw: raw.as_bytes().to_vec(),
        recv_user: recv.to_string(),
        send_user: send.to_string(),
        timestamp: 1000,
    }
}

async fn seed_friend_blocked() {
    let friend = Friend {
        id: 0,
        created_at: 1000,
        updated_at: 1000,
        friend_id: FRIEND.to_string(),
        friend_account: "alice".to_string(),
        friend_name: "Alice".to_string(),
        friend_icon: String::new(),
        friend_info: "{}".to_string(),
        friend_user_type: None,
        friend_status: 0,
        me: ME.to_string(),
        is_del: false,
        is_block: 0,
        is_mute: 0,
        is_top: 0,
        is_show: 1,
        version: 0,
    };
    update_friend_info_db(&friend).await.expect("写入好友失败");
    set_block_friend_db(ME, FRIEND, 1).await.expect("拉黑好友失败");
}

// ---------------- 无 DB 依赖的路由 ----------------

#[tokio::test]
async fn dispatch_empty_batch_is_ok() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    process_msg(vec![]).await.expect("空批次应成功");
    assert!(take_events().is_empty());
}

#[tokio::test]
async fn dispatch_json_type_is_noop() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    process_msg(vec![text_msg(T_JSON, "{}", FRIEND, ME)]).await.expect("JSON 类型应被忽略");
    assert!(take_events().is_empty(), "JSON 类型不应产生事件");
}

#[tokio::test]
async fn dispatch_unknown_type_is_ignored() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    process_msg(vec![text_msg(59999, "x", FRIEND, ME)]).await.expect("未知类型应被忽略");
    assert!(take_events().is_empty());
}

#[tokio::test]
async fn dispatch_ping_updates_user_state() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    seed_user(ME).await;
    insert_user_info("ping_lost_count", "7").await.expect("写入失败");

    process_msg(vec![text_msg(T_PING, "", ME, FRIEND)]).await.expect("ping 应处理成功");

    assert_eq!(get_user_info("ping_lost_count").await.expect("读取失败"), "0");
    assert!(get_user_info("last_pong_time").await.is_ok(), "应写入 last_pong_time");
    assert!(take_events().is_empty());
}

#[tokio::test]
async fn dispatch_p2p_from_system_is_noop() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    process_msg(vec![text_msg(T_P2P, "{}", ME, SYSTEM)]).await.expect("system P2P 应被忽略");
    assert!(take_events().is_empty());
}

#[tokio::test]
async fn dispatch_recall_invalid_payload_is_ignored() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    process_msg(vec![text_msg(T_RECALL, "not-a-json", FRIEND, ME)])
        .await
        .expect("非法撤回载荷应静默忽略");
    assert!(take_events().is_empty());
}

#[tokio::test]
async fn dispatch_webrtc_signal_emits() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    seed_user(ME).await;
    let signal = r#"{"type":"offer","sender":"f","receiver":"m","data":{},"timestamp":1}"#;

    process_msg(vec![text_msg(T_WEBRTC, signal, ME, FRIEND)]).await.expect("WebRTC 信令应处理成功");

    assert!(has_event(&take_events(), "webrtc_signal"));
}

#[tokio::test]
async fn dispatch_system_message_emits() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    seed_user(ME).await;
    process_msg(vec![text_msg(T_SYSTEM, "sys", ME, FRIEND)]).await.expect("系统消息应处理成功");
    assert!(has_event(&take_events(), "system_message"));
}

#[tokio::test]
async fn dispatch_force_logout_from_current_session_is_ignored() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    seed_user(ME).await;
    // token 的 payload = {"jti":"abc"}
    insert_user_info("token", "header.eyJqdGkiOiJhYmMifQ.sig").await.expect("写入 token 失败");

    let raw = r#"{"session":"abc","reason":"kicked"}"#;
    process_msg(vec![text_msg(T_FORCE_LOGOUT, raw, ME, FRIEND)])
        .await
        .expect("强退应处理成功");

    assert_eq!(get_user_info("uuid").await.expect("uuid 应保留"), ME, "本机会话强退不应清空用户态");
    assert!(take_events().is_empty(), "本机当前会话的强退不应发事件");
}

// ---------------- 依赖 user 库 ----------------

#[tokio::test]
async fn dispatch_call_control_from_stranger_emits() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_user_db(|_pool| async move {
        seed_user(ME).await;
        // 无好友记录 → 未拉黑
        process_msg(vec![text_msg(T_CALL_INVITE, "{}", ME, FRIEND)])
            .await
            .expect("通话控制应处理成功");
        assert!(has_event(&take_events(), "call_control"));
    })
    .await;
}

#[tokio::test]
async fn dispatch_notify_message_persists_and_emits() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_user_db(|_pool| async move {
        seed_user(ME).await;
        let notif = format!(
            r#"{{"id":"n1","title":"t","content":"c","created_at":100,"content_type":0,"user_id":"{}","biz_id":"b1","is_read":false,"level1":1,"level2":2,"level3":null,"level4":null,"unread_count":1,"priority":1,"is_synced":0}}"#,
            ME
        );
        process_msg(vec![text_msg(T_NOTIFY, &notif, ME, FRIEND)])
            .await
            .expect("通知应处理成功");
        assert!(has_event(&take_events(), "listen_notify_msg"));
    })
    .await;
}

// ---------------- 依赖 private 库 ----------------

#[tokio::test]
async fn dispatch_single_ack_unknown_send_is_skipped() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_private_db(|_pool| async move {
        seed_user(ME).await;
        process_msg(vec![text_msg(T_ACK, "no-such-send-id", FRIEND, ME)])
            .await
            .expect("未知 ack 应静默跳过");
        assert!(take_events().is_empty(), "不存在的发送记录不应产生事件");
    })
    .await;
}

#[tokio::test]
async fn dispatch_group_ack_confirms_and_emits() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_private_db(|_pool| async move {
        seed_user(ME).await;
        let ack = GroupMessageAck {
            id: 0,
            nano_id: String::new(),
            local_nano_id: "local-1".to_string(),
            group_uuid: GROUP.to_string(),
            send_user: ME.to_string(),
            text_type: T_GROUP_TEXT,
            ack_status: 0,
            raw: "group msg".to_string(),
            timestamp: 100,
        };
        insert_group_message_ack(&ack).await.expect("插入群 ack 失败");

        process_msg(vec![text_msg(T_GROUP_ACK, "local-1", GROUP, ME)])
            .await
            .expect("群 ack 应处理成功");

        let fetched = query_group_message_ack_by_local_nano_id("local-1")
            .await
            .expect("查询失败")
            .expect("群 ack 应存在");
        assert_eq!(fetched.ack_status, 1, "ack 应被置为已确认");
        assert!(has_event(&take_events(), "group_message_ack"));
    })
    .await;
}

// ---------------- 依赖 user + private 库 ----------------

#[tokio::test]
async fn dispatch_private_text_persists_record_session_and_events() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_user_and_private_db(|_user, _private| async move {
        seed_user(ME).await;
        let raw = r#"{"text":"hello"}"#;

        process_msg(vec![text_msg(T_TEXT, raw, ME, FRIEND)]).await.expect("私聊应处理成功");

        // 聊天记录落 private
        let rec = query_chat_record_by_id_from_db("nano-1", ME).await.expect("查询记录失败");
        assert_eq!(rec.raw, raw);

        // 会话建立并计未读
        let sessions = query_chat_session_by_user_db(ME, FRIEND).await.expect("查询会话失败");
        assert_eq!(sessions.len(), 1, "应建立单聊会话");
        assert_eq!(sessions[0].unread_count, 1);
        assert_eq!(sessions[0].session_type, 1);

        let events = take_events();
        assert!(has_event(&events, "text_message"), "应推送 text_message: {events:?}");
        assert!(has_event(&events, "chat_session"), "应推送 chat_session: {events:?}");
    })
    .await;
}

#[tokio::test]
async fn dispatch_private_text_from_blocked_friend_is_persisted_but_not_emitted() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_user_and_private_db(|_user, _private| async move {
        seed_user(ME).await;
        seed_friend_blocked().await;
        let raw = r#"{"text":"hi"}"#;

        process_msg(vec![text_msg(T_TEXT, raw, ME, FRIEND)]).await.expect("被拉黑也应成功");

        // 仍落库
        let rec = query_chat_record_by_id_from_db("nano-1", ME).await.expect("查询记录失败");
        assert_eq!(rec.raw, raw);
        // 但不展示/不进会话/不推送
        assert!(!has_event(&take_events(), "text_message"), "拉黑发送者不应推送");
    })
    .await;
}

#[tokio::test]
async fn dispatch_group_text_persists_record_session_and_event() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_user_and_private_db(|_user, _private| async move {
        seed_user(ME).await;
        // 预置群, 避免 create_group_chat_session_service 触发 HTTP
        let group = Group {
            id: 0,
            group_id: GROUP.to_string(),
            group_name: "G".to_string(),
            group_icon: String::new(),
            owner_id: ME.to_string(),
            created_at: 100,
            updated_at: 100,
            member_count: 1,
            is_del: 0,
            is_show: 1,
            version: 0,
        };
        Group::insert_group(&group).await.expect("插入群失败");

        let raw = r#"{"text":"g-hi"}"#;
        process_msg(vec![text_msg(T_GROUP_TEXT, raw, GROUP, FRIEND)]).await.expect("群聊应处理成功");

        let list = query_group_chat_record_from_db(GROUP, 10, 0).await.expect("查询群记录失败");
        assert_eq!(list.len(), 1, "群聊记录应落库");

        let sessions = query_chat_session_by_user_db(ME, GROUP).await.expect("查询会话失败");
        assert_eq!(sessions.len(), 1, "应建立群聊会话");
        assert_eq!(sessions[0].session_type, 2);

        assert!(has_event(&take_events(), "text_message"));
    })
    .await;
}

#[tokio::test]
async fn dispatch_single_ack_confirms_send_and_emits() {
    let _g = TEST_LOCK.lock().await;
    init_sink().await;
    with_user_and_private_db(|_user, _private| async move {
        seed_user(ME).await;
        let send = ChatRecordSend {
            id: 0,
            send_id: "send-1".to_string(),
            msg_id: String::new(),
            text_type: T_TEXT,
            platform: 0,
            recv_user: FRIEND.to_string(),
            send_user: ME.to_string(),
            timestamp: 100,
            raw: "hello".to_string(),
            send_status: 0,
            retry_count: 0,
        };
        insert_chat_record_send(&send).await.expect("插入发送记录失败");

        process_msg(vec![text_msg(T_ACK, "send-1", FRIEND, ME)]).await.expect("单聊 ack 应处理成功");

        let rec = query_record_send_from_db("send-1").await.expect("查询发送记录失败");
        assert_eq!(rec.send_status, 3, "ack 后应标记为已送达");
        assert!(has_event(&take_events(), "text_message"));
    })
    .await;
}
