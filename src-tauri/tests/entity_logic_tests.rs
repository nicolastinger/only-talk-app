#![cfg(test)]

//! 实体层纯逻辑单元测试：会话归一化、消息序列化(bincode/JSON)、常量。

use app_lib::entity::chat_record_raw::{
    ChatRecordRaw, FileRecord, ImageRecord, TextRecord, WebRTCSignalRecord,
};
use app_lib::entity::chat_session::ChatSession;
use app_lib::entity::quic_connection::{ConnectionType, FirstQuicMsg};
use app_lib::entity::text_msg::{HeadMsg, TextMsg, TextQuicMsg};
use app_lib::utils::message_types::{
    MSG_TYPE_GROUP_TEXT, MSG_TYPE_IMAGE, MSG_TYPE_P2P, MSG_TYPE_TEXT, MSG_TYPE_WEBRTC_SIGNAL,
};
use app_lib::utils::time::get_now_time_stamp_as_millis;
use app_lib::utils::uuid_utils::is_uuid;

// ---------- ChatSession::to_canonical ----------

fn make_session(send_user: &str, recv_user: &str, session_type: i64) -> ChatSession {
    ChatSession {
        id: 0,
        nano_id: "nano".to_string(),
        timestamp: 0,
        text_type: 0,
        unread_count: 0,
        last_message: String::new(),
        recv_user: recv_user.to_string(),
        send_user: send_user.to_string(),
        session_type,
        is_show: 1,
        is_top: 0,
        group_id: None,
    }
}

#[test]
fn chat_session_to_canonical_swaps_single_chat_when_send_is_me() {
    let s = make_session("me", "friend", 1);
    let c = s.to_canonical("me");
    assert_eq!(c.send_user, "friend");
    assert_eq!(c.recv_user, "me");
}

#[test]
fn chat_session_to_canonical_keeps_single_chat_already_canonical() {
    let s = make_session("friend", "me", 1);
    let c = s.to_canonical("me");
    assert_eq!(c.send_user, "friend");
    assert_eq!(c.recv_user, "me");
}

#[test]
fn chat_session_to_canonical_keeps_group_chat() {
    let s = make_session("group-id", "me", 2);
    let c = s.to_canonical("me");
    assert_eq!(c.send_user, "group-id");
    assert_eq!(c.recv_user, "me");
}

#[test]
fn chat_session_to_canonical_keeps_self_note() {
    let s = make_session("me", "me", 1);
    let c = s.to_canonical("me");
    assert_eq!(c.send_user, "me");
    assert_eq!(c.recv_user, "me");
}

// ---------- text_msg bincode 序列化 ----------

#[test]
fn head_msg_bincode_roundtrip() {
    let msg = HeadMsg { version: 1, crc: 0x1234, body_len: 100, message_type: 1 };
    let bytes = msg.get_bytes().expect("序列化失败");
    let back: HeadMsg = bincode::deserialize(&bytes).expect("反序列化失败");
    assert_eq!(back.version, msg.version);
    assert_eq!(back.crc, msg.crc);
    assert_eq!(back.body_len, msg.body_len);
    assert_eq!(back.message_type, msg.message_type);
}

#[test]
fn text_quic_msg_bincode_roundtrip() {
    let msg = TextQuicMsg {
        nano_id: "n1".to_string(),
        text_type: 1,
        raw: vec![1, 2, 3, 0xff],
        recv_user: "recv".to_string(),
        send_user: "send".to_string(),
        timestamp: 123_456_789,
    };
    let bytes = msg.get_bytes().expect("序列化失败");
    let back: TextQuicMsg = bincode::deserialize(&bytes).expect("反序列化失败");
    assert_eq!(back.nano_id, "n1");
    assert_eq!(back.text_type, 1);
    assert_eq!(back.raw, vec![1, 2, 3, 0xff]);
    assert_eq!(back.recv_user, "recv");
    assert_eq!(back.send_user, "send");
    assert_eq!(back.timestamp, 123_456_789);
}

// ---------- chat_record_raw JSON 序列化 ----------

#[test]
fn text_record_json_roundtrip() {
    let mut record = TextRecord { prev_id: "p0".to_string(), text: "hello".to_string(), platform: 0 };
    record.set_prev_id("p1".to_string());
    let json = record.json_serialize().expect("序列化失败");
    let back = TextRecord::deserialize(&json).expect("反序列化失败");
    assert_eq!(back.prev_id, "p1");
    assert_eq!(back.text, "hello");
    assert_eq!(back.platform, 0);
}

#[test]
fn image_record_json_roundtrip() {
    let mut record = ImageRecord {
        prev_id: String::new(),
        biz_id: "biz".to_string(),
        file_name: "a.png".to_string(),
        is_preview: true,
        img_width: 640,
        img_height: 480,
        img_size: 1024,
        platform: 0,
    };
    record.set_prev_id("prev".to_string());
    let json = record.json_serialize().expect("序列化失败");
    let back = ImageRecord::deserialize(&json).expect("反序列化失败");
    assert_eq!(back.biz_id, "biz");
    assert!(back.is_preview);
    assert_eq!(back.img_width, 640);
}

#[test]
fn file_record_json_roundtrip() {
    let mut record = FileRecord {
        prev_id: String::new(),
        biz_id: "biz".to_string(),
        file_name: "doc.pdf".to_string(),
        file_size: 2048,
        file_type: "pdf".to_string(),
        platform: 1,
    };
    record.set_prev_id("prev".to_string());
    let json = record.json_serialize().expect("序列化失败");
    let back = FileRecord::deserialize(&json).expect("反序列化失败");
    assert_eq!(back.file_name, "doc.pdf");
    assert_eq!(back.file_size, 2048);
}

#[test]
fn webrtc_signal_record_json_uses_renamed_keys() {
    let record = WebRTCSignalRecord {
        prev_id: String::new(),
        signal_type: "offer".to_string(),
        sender: "a".to_string(),
        receiver: "b".to_string(),
        session_id: "s1".to_string(),
        data: serde_json::from_str::<serde_json::Value>(r#"{"sdp":"v0"}"#).expect("构造 JSON 失败"),
        timestamp: 123,
    };
    let json = record.json_serialize().expect("序列化失败");
    let value: serde_json::Value = serde_json::from_str(&json).expect("解析失败");
    assert_eq!(value["type"], "offer", "signal_type 应序列化为 type 键");
    assert_eq!(value["sessionId"], "s1", "session_id 应序列化为 sessionId 键");

    let back = WebRTCSignalRecord::deserialize(&json).expect("反序列化失败");
    assert_eq!(back.signal_type, "offer");
    assert_eq!(back.session_id, "s1");
    assert_eq!(back.data["sdp"], "v0");
}

// ---------- quic_connection ----------

#[test]
fn connection_type_display() {
    assert_eq!(ConnectionType::Text.to_string(), "text");
    assert_eq!(ConnectionType::Img.to_string(), "img");
    assert_eq!(ConnectionType::Video.to_string(), "video");
    assert_eq!(ConnectionType::File.to_string(), "file");
    assert_eq!(ConnectionType::Other.to_string(), "other");
}

#[test]
fn connection_type_serde_roundtrip() {
    for ct in [
        ConnectionType::Text,
        ConnectionType::Img,
        ConnectionType::Video,
        ConnectionType::File,
        ConnectionType::Other,
    ] {
        let json = serde_json::to_string(&ct).expect("序列化失败");
        let back: ConnectionType = serde_json::from_str(&json).expect("反序列化失败");
        assert_eq!(format!("{:?}", back), format!("{:?}", ct));
    }
}

#[test]
fn first_quic_msg_serde_roundtrip() {
    let msg = FirstQuicMsg {
        token: "token".to_string(),
        uuid: "uuid".to_string(),
        msg_type: ConnectionType::Text,
        text_serde_struct: "{}".to_string(),
        dyn_buffer_size: 1024,
        dyn_header_size: 9,
    };
    let json = serde_json::to_string(&msg).expect("序列化失败");
    let back: FirstQuicMsg = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.token, "token");
    assert_eq!(back.uuid, "uuid");
    assert_eq!(back.dyn_buffer_size, 1024);
    assert_eq!(back.dyn_header_size, 9);
    assert!(matches!(back.msg_type, ConnectionType::Text));
}

// ---------- utils ----------

#[test]
fn uuid_utils_is_uuid() {
    assert!(is_uuid("00000000-0000-0000-0000-000000000001"));
    assert!(!is_uuid("not-a-uuid"));
    assert!(!is_uuid(""));
    assert!(!is_uuid("00000000-0000-0000-0000-00000000000"));
}

#[test]
fn now_timestamp_is_recent() {
    let ts = get_now_time_stamp_as_millis().expect("获取时间戳失败");
    assert!(ts > 1_577_836_800_000, "时间戳应晚于 2020-01-01, got {}", ts);
}

#[test]
fn message_types_constants_sanity() {
    assert_eq!(MSG_TYPE_TEXT, 1);
    assert_eq!(MSG_TYPE_IMAGE, 2);
    assert_eq!(MSG_TYPE_P2P, 4);
    assert_eq!(MSG_TYPE_WEBRTC_SIGNAL, 100);
    assert_eq!(MSG_TYPE_GROUP_TEXT, 2001);
}