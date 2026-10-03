//! 消息生命周期约束
//!
//! 用类型系统的常量固定四类消息在发送/接收/存储/回执/重发/事件分发各环节的行为：
//! 文本(1/2/3)、通话控制(12-15)、WebRTC 信令(100)、WebRTC 数据(DataChannel/P2P)。
//! 替换散落的 `if (12..=15).contains(&text_type)` 硬编码分支，
//! 使"会话信息(文本)与控制命令(控制/信令/数据)"的分离由类型层面强制保证。

use crate::utils::message_types::{
    MSG_TYPE_FILE, MSG_TYPE_IMAGE, MSG_TYPE_P2P_VIDEO_CALL_ACCEPT, MSG_TYPE_P2P_VIDEO_CALL_END,
    MSG_TYPE_P2P_VIDEO_CALL_INVITE, MSG_TYPE_P2P_VIDEO_CALL_REJECT, MSG_TYPE_TEXT,
    MSG_TYPE_WEBRTC_SIGNAL,
};

/// 服务端对某类消息的处理方式
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerBehavior {
    /// 服务端存储 + 回 ACK（文本/图片/文件）
    Store,
    /// 服务端只转发、不存储、不 ACK（通话控制 12-15 / WebRTC 信令 100）
    RelayOnly,
    /// 不经服务端，端到端 P2P（WebRTC 数据通道 / 媒体帧）
    PeerToPeer,
}

/// 消息生命周期约束
pub trait MessageLifecycle: Sync {
    /// 命中的 text_type
    fn matches(text_type: u16) -> bool;
    /// 发送方本地是否落库（写 chat_record_send / chat_record_ack）
    const PERSIST_SENDER_LOCAL: bool;
    /// 接收方是否写入 chat_record（进入聊天历史气泡）
    const PERSIST_RECEIVER_HISTORY: bool;
    /// 是否使用 prev_id 顺序链
    const USE_PREV_ID: bool;
    /// 是否更新会话列表 / 未读数 / 会话预览
    const UPDATE_SESSION_LIST: bool;
    /// 发送失败是否进入待发队列并自动重发（断连不丢）
    const RETRY_ON_FAILURE: bool;
    /// 是否自动生成一条 type=1 文本记录作为历史（仅通话控制 = true）
    const AUTO_TEXT_RECORD: bool;
    /// 分发给前端的事件名（None = 不下发；WebRTC 数据为 None）
    const FRONTEND_EVENT: Option<&'static str>;
    /// 服务端行为
    const SERVER_BEHAVIOR: ServerBehavior;
}

/// 文本/图片/文件（1/2/3）：完整历史，prev_id + send/ack 表 + 失败重发
pub struct TextLifecycle;
impl MessageLifecycle for TextLifecycle {
    fn matches(text_type: u16) -> bool {
        matches!(text_type, MSG_TYPE_TEXT | MSG_TYPE_IMAGE | MSG_TYPE_FILE)
    }

    const PERSIST_SENDER_LOCAL: bool = true;
    const PERSIST_RECEIVER_HISTORY: bool = true;
    const USE_PREV_ID: bool = true;
    const UPDATE_SESSION_LIST: bool = true;
    const RETRY_ON_FAILURE: bool = true;
    const AUTO_TEXT_RECORD: bool = false;
    const FRONTEND_EVENT: Option<&'static str> = Some("text_message");
    const SERVER_BEHAVIOR: ServerBehavior = ServerBehavior::Store;
}

/// 通话控制（12-15）：只转发不存储不重发，历史由自动生成的文本记录承担
pub struct CallControlLifecycle;
impl MessageLifecycle for CallControlLifecycle {
    fn matches(text_type: u16) -> bool {
        matches!(
            text_type,
            MSG_TYPE_P2P_VIDEO_CALL_INVITE
                | MSG_TYPE_P2P_VIDEO_CALL_ACCEPT
                | MSG_TYPE_P2P_VIDEO_CALL_REJECT
                | MSG_TYPE_P2P_VIDEO_CALL_END
        )
    }

    const PERSIST_SENDER_LOCAL: bool = false;
    const PERSIST_RECEIVER_HISTORY: bool = false;
    const USE_PREV_ID: bool = false;
    const UPDATE_SESSION_LIST: bool = false;
    const RETRY_ON_FAILURE: bool = false;
    const AUTO_TEXT_RECORD: bool = true;
    const FRONTEND_EVENT: Option<&'static str> = Some("call_control");
    const SERVER_BEHAVIOR: ServerBehavior = ServerBehavior::RelayOnly;
}

/// WebRTC 信令（100）：只转发不存储，不进聊天历史
pub struct SignalLifecycle;
impl MessageLifecycle for SignalLifecycle {
    fn matches(text_type: u16) -> bool {
        text_type == MSG_TYPE_WEBRTC_SIGNAL
    }

    const PERSIST_SENDER_LOCAL: bool = false;
    const PERSIST_RECEIVER_HISTORY: bool = false;
    const USE_PREV_ID: bool = false;
    const UPDATE_SESSION_LIST: bool = false;
    const RETRY_ON_FAILURE: bool = false;
    const AUTO_TEXT_RECORD: bool = false;
    const FRONTEND_EVENT: Option<&'static str> = Some("webrtc_signal");
    const SERVER_BEHAVIOR: ServerBehavior = ServerBehavior::RelayOnly;
}

/// WebRTC 数据（DataChannel / P2P 媒体）：不经服务端，纯实时临时数据
pub struct WebRTCDataLifecycle;
impl MessageLifecycle for WebRTCDataLifecycle {
    fn matches(_text_type: u16) -> bool {
        false
    }

    const PERSIST_SENDER_LOCAL: bool = false;
    const PERSIST_RECEIVER_HISTORY: bool = false;
    const USE_PREV_ID: bool = false;
    const UPDATE_SESSION_LIST: bool = false;
    const RETRY_ON_FAILURE: bool = false;
    const AUTO_TEXT_RECORD: bool = false;
    const FRONTEND_EVENT: Option<&'static str> = None;
    const SERVER_BEHAVIOR: ServerBehavior = ServerBehavior::PeerToPeer;
}

/// 生命周期种类（运行时分发用；trait 本身用关联常量约束行为，故不以 dyn 对象暴露）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageLifecycleKind {
    Text,
    CallControl,
    Signal,
}

/// text_type -> 生命周期种类（分发入口）
pub fn lifecycle_of(text_type: u16) -> Option<MessageLifecycleKind> {
    if TextLifecycle::matches(text_type) {
        return Some(MessageLifecycleKind::Text);
    }
    if CallControlLifecycle::matches(text_type) {
        return Some(MessageLifecycleKind::CallControl);
    }
    if SignalLifecycle::matches(text_type) {
        return Some(MessageLifecycleKind::Signal);
    }
    None
}