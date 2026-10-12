//! 消息撤回（伪撤回）。
//!
//! 不做真正的服务端撤回：撤回方再发送一条"撤回控制消息"，携带目标消息的
//! `nano_id`；对端收到后校验两条消息发送者一致，再把目标消息内容清除并置
//! `deleted = 1`，前端将撤回消息渲染为"xxx 撤回了一条消息"。
//!
//! 存储/传输格式：
//! - 单聊：独立类型 `MSG_TYPE_RECALL`，`raw` 即撤回载荷 JSON；
//! - 群聊：服务端仅识别 2001/2004 为群类型，故以 `MSG_TYPE_GROUP_TEXT(2001)`
//!   承载，撤回载荷放在外层 `GroupTextRecord.text` 中。

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::entity::chat_record_raw::ChatRecordRaw;
use crate::service::chat_service::GroupTextRecord;

/// 撤回载荷标记 key（带版本号，避免与普通文本误判）。
pub const RECALL_MARKER_KEY: &str = "ot_recall";

/// 撤回载荷。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecallPayload {
    /// 标记（固定为 1），用于识别载荷类型。
    pub ot_recall: u8,
    /// 被撤回消息的 nano_id（服务端分配，双方一致）。
    pub target_nano_id: String,
}

/// 构造撤回载荷 JSON，用于单聊 `raw` / 群聊内层 `text`。
pub fn build_recall_raw(target_nano_id: &str) -> Result<String, anyhow::Error> {
    let payload = RecallPayload { ot_recall: 1, target_nano_id: target_nano_id.to_string() };
    Ok(serde_json::to_string(&payload)?)
}

/// 从 raw 中解析撤回目标 nano_id；非撤回载荷返回 None。
pub fn parse_recall_target(raw: &str) -> Option<String> {
    let value: Value = serde_json::from_str(raw).ok()?;
    let marker = value.get(RECALL_MARKER_KEY)?.as_u64()?;
    if marker != 1 {
        return None;
    }
    value.get("target_nano_id")?.as_str().map(ToString::to_string)
}

/// 从群聊 raw（外层 `GroupTextRecord`）解析撤回目标 nano_id。
pub fn parse_group_recall_target(raw: &str) -> Option<String> {
    let outer = <GroupTextRecord as ChatRecordRaw>::deserialize(raw).ok()?;
    parse_recall_target(&outer.text)
}

/// 撤回校验：仅当被撤回消息的发送者与撤回消息的发送者一致时允许撤回。
///
/// `original_send_user` 为空(未找到)时不允许。
pub fn can_recall(original_send_user: &str, recall_send_user: &str) -> bool {
    !original_send_user.is_empty() && original_send_user == recall_send_user
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_and_parse_roundtrip() {
        let raw = build_recall_raw("abc123").expect("构建撤回载荷失败");
        assert_eq!(parse_recall_target(&raw).as_deref(), Some("abc123"));
    }

    #[test]
    fn parse_rejects_non_recall() {
        assert_eq!(parse_recall_target("hello"), None);
        assert_eq!(parse_recall_target(r#"{"text":"hi"}"#), None);
        assert_eq!(parse_recall_target(r#"{"ot_recall":2,"target_nano_id":"x"}"#), None);
        assert_eq!(parse_recall_target(r#"{"ot_recall":1}"#), None);
    }

    #[test]
    fn parse_group_wrapped() {
        let inner = build_recall_raw("g1").expect("构建失败");
        let outer = GroupTextRecord { text: inner, send_user: "u1".to_string() };
        let raw = serde_json::to_string(&outer).expect("序列化失败");
        assert_eq!(parse_group_recall_target(&raw).as_deref(), Some("g1"));
    }

    #[test]
    fn can_recall_requires_same_sender() {
        assert!(can_recall("u1", "u1"));
        assert!(!can_recall("u1", "u2"));
        assert!(!can_recall("", "u1"));
    }
}
