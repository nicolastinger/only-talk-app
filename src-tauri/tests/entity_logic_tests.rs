#![cfg(test)]

//! 实体层纯逻辑单元测试：会话归一化、消息序列化(bincode/JSON)、常量。

use app_lib::entity::chat_record_raw::{ChatRecordRaw, FileRecord, ImageRecord, TextRecord};
use app_lib::entity::chat_session::ChatSession;
use app_lib::entity::quic_connection::{ConnectionType, FirstQuicMsg};
use app_lib::entity::text_msg::{HeadMsg, TextMsg, TextQuicMsg};
use app_lib::service::chat_service::{GroupFileRecord, GroupImageRecord, GroupTextRecord};
use app_lib::service::message_convert::{
    group_raw_to_private, normalize_for_target, private_raw_to_group,
};
use app_lib::utils::message_types::{
    MSG_TYPE_FILE, MSG_TYPE_GROUP_FILE, MSG_TYPE_GROUP_IMAGE, MSG_TYPE_GROUP_TEXT, MSG_TYPE_IMAGE,
    MSG_TYPE_P2P, MSG_TYPE_TEXT, MSG_TYPE_WEBRTC_SIGNAL,
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
        session_uuid: None,
        last_message_id: 0,
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
    let mut record =
        TextRecord { prev_id: "p0".to_string(), text: "hello".to_string(), platform: 0 };
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

// ---------- 消息格式互转 (转发) ----------

fn private_text_json(text: &str) -> String {
    TextRecord { prev_id: "prev".to_string(), text: text.to_string(), platform: 0 }
        .json_serialize()
        .expect("文本序列化失败")
}

fn private_image_json(biz_id: &str) -> String {
    ImageRecord {
        prev_id: "prev".to_string(),
        biz_id: biz_id.to_string(),
        file_name: "a.png".to_string(),
        is_preview: false,
        img_width: 640,
        img_height: 480,
        img_size: 1024,
        platform: 0,
    }
    .json_serialize()
    .expect("图片序列化失败")
}

fn private_file_json(biz_id: &str) -> String {
    FileRecord {
        prev_id: "prev".to_string(),
        biz_id: biz_id.to_string(),
        file_name: "doc.pdf".to_string(),
        file_size: 2048,
        file_type: "pdf".to_string(),
        platform: 0,
    }
    .json_serialize()
    .expect("文件序列化失败")
}

fn group_outer(inner: &str) -> String {
    GroupTextRecord { text: inner.to_string(), send_user: "sender".to_string() }
        .json_serialize()
        .expect("群外层序列化失败")
}

fn group_image_inner(biz_id: &str) -> String {
    GroupImageRecord {
        biz_id: biz_id.to_string(),
        file_name: "a.png".to_string(),
        img_width: 640,
        img_height: 480,
        img_size: 1024,
        send_user: "sender".to_string(),
    }
    .json_serialize()
    .expect("群图片序列化失败")
}

fn group_file_inner(biz_id: &str) -> String {
    GroupFileRecord {
        biz_id: biz_id.to_string(),
        file_name: "doc.pdf".to_string(),
        file_size: 2048,
        file_type: "pdf".to_string(),
        send_user: "sender".to_string(),
    }
    .json_serialize()
    .expect("群文件序列化失败")
}

#[test]
fn private_text_to_group_text() {
    let raw = private_text_json("hello");
    let (t, out) = private_raw_to_group(MSG_TYPE_TEXT, &raw, "me").expect("互转失败");
    assert_eq!(t, MSG_TYPE_GROUP_TEXT);
    assert_eq!(out, "hello");
}

#[test]
fn group_text_to_private_text() {
    let raw = group_outer("hello");
    let (t, out) = group_raw_to_private(MSG_TYPE_GROUP_TEXT, &raw).expect("互转失败");
    assert_eq!(t, MSG_TYPE_TEXT);
    let record = TextRecord::deserialize(&out).expect("反序列化失败");
    assert_eq!(record.text, "hello");
    assert_eq!(record.prev_id, "");
    assert_eq!(record.platform, 0);
}

#[test]
fn private_image_to_group_image() {
    let raw = private_image_json("biz-1");
    let (t, out) = private_raw_to_group(MSG_TYPE_IMAGE, &raw, "me").expect("互转失败");
    assert_eq!(t, MSG_TYPE_GROUP_IMAGE);
    let g = GroupImageRecord::deserialize(&out).expect("反序列化失败");
    assert_eq!(g.biz_id, "biz-1");
    assert_eq!(g.img_width, 640);
    assert_eq!(g.img_height, 480);
    assert_eq!(g.img_size, 1024);
    assert_eq!(g.send_user, "me");
}

#[test]
fn group_image_to_private_image() {
    let raw = group_outer(&group_image_inner("biz-2"));
    let (t, out) = group_raw_to_private(MSG_TYPE_GROUP_IMAGE, &raw).expect("互转失败");
    assert_eq!(t, MSG_TYPE_IMAGE);
    let r = ImageRecord::deserialize(&out).expect("反序列化失败");
    assert_eq!(r.biz_id, "biz-2");
    assert!(!r.is_preview);
    assert_eq!(r.prev_id, "");
    assert_eq!(r.platform, 0);
}

#[test]
fn private_file_to_group_file() {
    let raw = private_file_json("biz-3");
    let (t, out) = private_raw_to_group(MSG_TYPE_FILE, &raw, "me").expect("互转失败");
    assert_eq!(t, MSG_TYPE_GROUP_FILE);
    let g = GroupFileRecord::deserialize(&out).expect("反序列化失败");
    assert_eq!(g.biz_id, "biz-3");
    assert_eq!(g.file_name, "doc.pdf");
    assert_eq!(g.file_size, 2048);
    assert_eq!(g.file_type, "pdf");
    assert_eq!(g.send_user, "me");
}

#[test]
fn group_file_to_private_file() {
    let raw = group_outer(&group_file_inner("biz-4"));
    let (t, out) = group_raw_to_private(MSG_TYPE_GROUP_FILE, &raw).expect("互转失败");
    assert_eq!(t, MSG_TYPE_FILE);
    let r = FileRecord::deserialize(&out).expect("反序列化失败");
    assert_eq!(r.biz_id, "biz-4");
    assert_eq!(r.file_name, "doc.pdf");
    assert_eq!(r.prev_id, "");
    assert_eq!(r.platform, 0);
}

#[test]
fn round_trip_private_group_private_keeps_payload() {
    // 文本
    let (_, group_text) = normalize_for_target(MSG_TYPE_TEXT, &private_text_json("hi"), true, "me")
        .expect("私聊->群聊失败");
    let (t, back_text) =
        normalize_for_target(MSG_TYPE_GROUP_TEXT, &group_outer(&group_text), false, "me")
            .expect("群聊->私聊失败");
    assert_eq!(t, MSG_TYPE_TEXT);
    assert_eq!(TextRecord::deserialize(&back_text).expect("反序列化失败").text, "hi");

    // 图片
    let (_, group_img) =
        normalize_for_target(MSG_TYPE_IMAGE, &private_image_json("biz-5"), true, "me")
            .expect("私聊->群聊失败");
    let (t, back_img) =
        normalize_for_target(MSG_TYPE_GROUP_IMAGE, &group_outer(&group_img), false, "me")
            .expect("群聊->私聊失败");
    assert_eq!(t, MSG_TYPE_IMAGE);
    assert_eq!(ImageRecord::deserialize(&back_img).expect("反序列化失败").biz_id, "biz-5");

    // 文件
    let (_, group_file) =
        normalize_for_target(MSG_TYPE_FILE, &private_file_json("biz-6"), true, "me")
            .expect("私聊->群聊失败");
    let (t, back_file) =
        normalize_for_target(MSG_TYPE_GROUP_FILE, &group_outer(&group_file), false, "me")
            .expect("群聊->私聊失败");
    assert_eq!(t, MSG_TYPE_FILE);
    assert_eq!(FileRecord::deserialize(&back_file).expect("反序列化失败").biz_id, "biz-6");
}

#[test]
fn same_context_passthrough_unchanged() {
    // 私聊 -> 私聊：raw 原样复用
    let raw = private_text_json("keep");
    let (t, out) = normalize_for_target(MSG_TYPE_TEXT, &raw, false, "me").expect("归一化失败");
    assert_eq!(t, MSG_TYPE_TEXT);
    assert_eq!(out, raw);

    // 群聊 -> 群聊：解出内层 text 原样复用
    let (t, out) = normalize_for_target(MSG_TYPE_GROUP_TEXT, &group_outer("keep"), true, "me")
        .expect("归一化失败");
    assert_eq!(t, MSG_TYPE_GROUP_TEXT);
    assert_eq!(out, "keep");
}

#[test]
fn convert_rejects_unsupported_type_and_bad_json() {
    // 隐私消息等类型不支持转发
    assert!(normalize_for_target(MSG_TYPE_P2P, "{}", false, "me").is_err());
    // 非法 JSON
    assert!(normalize_for_target(MSG_TYPE_TEXT, "not-json", true, "me").is_err());
    assert!(group_raw_to_private(MSG_TYPE_GROUP_TEXT, "not-json").is_err());
}

#[test]
fn legacy_raw_text_type_zero_forwards_as_text() {
    // 遗留原生文本(0) -> 单聊：转为 TextRecord(type 1)
    let (t, out) = normalize_for_target(0, "legacy hi", false, "me").expect("归一化失败");
    assert_eq!(t, MSG_TYPE_TEXT);
    assert_eq!(TextRecord::deserialize(&out).expect("反序列化失败").text, "legacy hi");

    // 遗留原生文本(0) -> 群聊：纯文本(type 2001)
    let (t, out) = normalize_for_target(0, "legacy hi", true, "me").expect("归一化失败");
    assert_eq!(t, MSG_TYPE_GROUP_TEXT);
    assert_eq!(out, "legacy hi");
}
