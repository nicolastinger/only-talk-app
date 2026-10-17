//! 聊天领域服务。
//!
//! 原 `chat_service.rs` 按职责拆分为多个子模块，`mod.rs` 仅做组织与再导出，
//! 对外路径 `crate::service::chat_service::*` 保持不变：
//!
//! - [`session`]：会话生命周期与已读/未读
//! - [`record`]：聊天记录读取
//! - [`send`]：单聊发送管道（持久化 / 重发 / 补发 / 通话控制 / WebRTC 信令）
//! - [`group`]：群聊发送
//! - [`media`]：图片/文件上传与压缩
//! - [`forward`]：消息转发
//! - [`recall`]：撤回与本地撤回核对
//! - [`message_convert`]：单聊/群聊 raw 互转

mod forward;
mod group;
mod media;
mod message_convert;
mod recall;
mod record;
mod send;
mod session;

pub use forward::forward_chat_messages_service;
pub use group::{
    send_group_file_msg_service, send_group_image_msg_service, send_group_text_msg_service,
    GroupFileRecord, GroupImageRecord, GroupTextRecord,
};
pub use media::{send_file_msg_service, send_image_msg_service};
pub use message_convert::{group_raw_to_private, normalize_for_target, private_raw_to_group};
pub use recall::{
    recall_chat_message_service, recall_group_chat_message_service, reconcile_group_recalls,
    reconcile_single_recalls, resolve_group_recall_target, resolve_single_recall_target,
};
pub use record::{
    delete_chat_record_service, delete_group_chat_record_service, get_chat_record_by_type_service,
    get_chat_record_service, get_group_chat_record_service, get_pending_send_records_service,
    mark_read_service,
};
pub use send::{
    ignore_send_msg_service, prepare_pending_msg_for_send, process_no_send_success_msg,
    retry_send_msg_service, send_call_control_msg_service, send_msg, send_persistent_text_msg,
    send_text_msg_service, send_webrtc_signal_service, set_prev_id,
};
pub use session::{
    clear_all_unread_sessions_service, clear_chat_session, create_chat_session_service,
    create_group_chat_session_service, emit_chat_session_event, get_chat_session_service,
    get_group_chat_session_service, hide_chat_session_service, search_chat_session_service,
    update_group_last_read_msg_service, update_last_read_msg_from_db, update_last_read_msg_service,
};
