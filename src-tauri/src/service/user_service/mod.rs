//! 用户服务。
//!
//! 原 `user_service.rs` 按职责拆分为多个子模块，`mod.rs` 仅做组织与再导出，
//! 对外路径 `crate::service::user_service::*` 保持不变：
//!
//! - [`session`]：登录/登出会话生命周期与后台任务监督
//! - [`quic`]：QUIC 连接断开/重连与服务器发现
//! - [`read_report`]：已读水位与系统通知定时上报
//! - [`sync`]：离线消息正向追平

mod quic;
mod read_report;
mod session;
mod sync;

pub use quic::{disconnect_quic, reconnect_quic};
pub use read_report::{get_unread_notification, send_notify_read_message, send_read_message};
pub(crate) use session::{perform_session_login_tasks, perform_session_logout_tasks};
pub use session::{start_session_tasks, teardown_session, user_login};
pub use sync::{get_sync_history, sync_offline_messages, SyncBatchView};

pub use crate::utils::user_state::{add_user_map, get_user_info, get_user_map, insert_user_info};
