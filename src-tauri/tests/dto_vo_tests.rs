#![cfg(test)]

//! DTO / VO 序列化单元测试。

use app_lib::dto::http_result::HttpResult;
use app_lib::vo::http_response::Response;
use app_lib::vo::text_quic_msg::TextQuicMsgVo;

#[test]
fn http_result_serde_roundtrip() {
    let result = HttpResult {
        code: 200,
        data: serde_json::from_str::<serde_json::Value>(r#"{"uuid":"u1","list":[1,2]}"#)
            .expect("构造 JSON 失败"),
        message: "ok".to_string(),
    };
    let json = serde_json::to_string(&result).expect("序列化失败");
    let back: HttpResult = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.code, 200);
    assert_eq!(back.data["uuid"], "u1");
    assert_eq!(back.message, "ok");
}

#[test]
fn http_result_deserialize_from_server_format() {
    let json = r#"{"code":204,"data":null,"message":"no content"}"#;
    let back: HttpResult = serde_json::from_str(json).expect("反序列化失败");
    assert_eq!(back.code, 204);
    assert!(back.data.is_null());
}

#[test]
fn response_serde_roundtrip() {
    let response = Response {
        code: 200,
        message: "ok".to_string(),
        data: Some(
            serde_json::from_str::<serde_json::Value>(r#"[1,2,3]"#).expect("构造 JSON 失败"),
        ),
    };
    let json = serde_json::to_string(&response).expect("序列化失败");
    let back: Response = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.code, 200);
    assert_eq!(
        back.data.expect("应有 data"),
        serde_json::from_str::<serde_json::Value>(r#"[1,2,3]"#).expect("构造 JSON 失败"),
    );
}

#[test]
fn response_data_null_roundtrip() {
    let response = Response { code: 204, message: "".to_string(), data: None };
    let json = serde_json::to_string(&response).expect("序列化失败");
    let back: Response = serde_json::from_str(&json).expect("反序列化失败");
    assert!(back.data.is_none());
}

#[test]
fn text_quic_msg_vo_serde_roundtrip() {
    let vo = TextQuicMsgVo {
        nano_id: "n".to_string(),
        text_type: 1,
        raw: "hello".to_string(),
        recv_user: "a".to_string(),
        send_user: "b".to_string(),
        timestamp: 123,
    };
    let json = serde_json::to_string(&vo).expect("序列化失败");
    let back: TextQuicMsgVo = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.raw, "hello");
    assert_eq!(back.text_type, 1);
    assert_eq!(back.timestamp, 123);
    assert_eq!(back.send_user, "b");
}
