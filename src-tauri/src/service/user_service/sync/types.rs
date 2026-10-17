//! 同步相关 DTO(服务端 `/session/sync`、`/session/list` 响应)。

#[derive(Debug, serde::Deserialize)]
pub(super) struct SyncResponse {
    #[allow(dead_code)]
    server_time: i64,
    pub(super) sessions: Vec<SyncSession>,
}

#[derive(Debug, serde::Deserialize)]
pub(super) struct SyncSession {
    #[allow(dead_code)]
    session_uuid: String,
    pub(super) session_type: i16,
    /// 服务端已读游标(user_session.last_read_id): id <= 该值的消息视为其他端已读, 不计未读
    pub(super) last_read_id: i64,
    pub(super) messages: Vec<SyncMessage>,
    pub(super) next_cursor: i64,
    pub(super) has_more: bool,
}

#[derive(Debug, serde::Deserialize)]
pub(super) struct SyncMessage {
    pub(super) id: i64,
    pub(super) nano_id: String,
    #[allow(dead_code)]
    session_uuid: String,
    #[allow(dead_code)]
    session_type: i16,
    pub(super) send_user: String,
    pub(super) recv_user: String,
    pub(super) text_type: u16,
    pub(super) timestamp: i64,
    pub(super) raw: Vec<u8>,
}

/// 会话列表响应(任务06 §4.1)
#[derive(Debug, serde::Deserialize)]
pub(super) struct SessionListResponse {
    pub(super) sessions: Vec<SessionListItem>,
    pub(super) has_more: bool,
    pub(super) next_cursor: Option<SessionListCursor>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub(super) struct SessionListItem {
    pub(super) session_uuid: String,
    pub(super) session_type: i16,
    pub(super) peer_uuid: Option<String>,
    pub(super) last_message_id: i64,
    pub(super) last_message_at: i64,
    pub(super) last_preview: String,
    pub(super) pinned: i16,
    #[allow(dead_code)]
    muted: i16,
    #[allow(dead_code)]
    unread: i64,
}

#[derive(Debug, serde::Deserialize)]
pub(super) struct SessionListCursor {
    pub(super) pinned: i16,
    pub(super) last_message_at: i64,
    pub(super) session_uuid: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 任务07 §8.1: /session/sync 响应结构完整解析。
    #[test]
    fn sync_response_parse() {
        let json = r#"{
            "server_time": 1758000000000,
            "sessions": [{
                "session_uuid": "3f2b",
                "session_type": 1,
                "last_read_id": 0,
                "messages": [{
                    "id": 12345,
                    "nano_id": "n1",
                    "session_uuid": "3f2b",
                    "session_type": 1,
                    "send_user": "a",
                    "recv_user": "b",
                    "text_type": 1,
                    "timestamp": 1757999999000,
                    "raw": [104, 105]
                }],
                "next_cursor": 12345,
                "has_more": false
            }]
        }"#;
        let resp: SyncResponse = serde_json::from_str(json).expect("解析 SyncResponse 失败");
        assert_eq!(resp.sessions.len(), 1);
        let s = &resp.sessions[0];
        assert_eq!(s.session_uuid, "3f2b");
        assert_eq!(s.session_type, 1);
        assert_eq!(s.messages.len(), 1);
        assert_eq!(s.messages[0].id, 12345);
        assert_eq!(s.messages[0].raw, vec![104, 105]);
        assert_eq!(s.next_cursor, 12345);
        assert!(!s.has_more);
    }

    /// 任务07 §8.1: /session/list 响应结构完整解析。
    #[test]
    fn session_list_response_parse() {
        let json = r#"{
            "sessions": [{
                "session_uuid": "su1",
                "session_type": 1,
                "peer_uuid": "p1",
                "last_message_id": 9,
                "last_message_at": 1758000000000,
                "last_preview": "hi",
                "pinned": 1,
                "muted": 0,
                "unread": 2
            }],
            "has_more": true,
            "next_cursor": { "pinned": 1, "last_message_at": 1758000000000, "session_uuid": "su1" }
        }"#;
        let resp: SessionListResponse = serde_json::from_str(json).expect("解析 SessionList 失败");
        assert_eq!(resp.sessions.len(), 1);
        assert!(resp.has_more);
        let c = resp.next_cursor.expect("应有游标");
        assert_eq!(c.session_uuid, "su1");
        assert_eq!(c.pinned, 1);
    }
}
