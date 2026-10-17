//! 入站消息分发。
//!
//! [`dispatch::process_msg`] 只做按 `text_type` 的路由转发; 各类型的业务处理
//! 分散在 [`handlers`] 下的独立 handler 中; 新消息到达提醒见 [`alert`]。

mod alert;
mod dispatch;
mod handlers;

pub use dispatch::process_msg;
