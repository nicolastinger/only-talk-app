//! 应用配置: 内存配置项(`GLOBAL_CONFIG`)读写 + 配置常量。
//!
//! 本模块只做纯内存读写与常量定义, 不依赖 dao/service, 各层可安全向下依赖;
//! 与公共库 `client_config` 表的持久化编排见 `service::config_service`。

mod store;

pub use store::*;

/// 默认 GitHub 仓库(格式 owner/repo), 可用客户端配置 `update.github_repo` 覆盖。
pub const DEFAULT_GITHUB_REPO: &str = "nicolastinger/only-talk-app";
