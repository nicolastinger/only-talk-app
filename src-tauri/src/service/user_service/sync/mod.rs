//! 离线同步（任务12：客户端游标驱动的正向追平）。
//!
//! - [`orchestrator`]：通知 → 刷新会话列表 → 串行逐会话追平 → 记录批次
//! - [`session_merge`]：拉取 `/session/list` 并合并进本地会话表
//! - [`apply`]：同步消息落库（去重/回填 server_id）与跨端已读水位回填
//! - [`types`]：`/session/sync`、`/session/list` 响应 DTO

mod apply;
mod orchestrator;
mod session_merge;
mod types;

pub(super) use orchestrator::refresh_and_forward;
pub use orchestrator::{get_sync_history, sync_offline_messages, SyncBatchView};
