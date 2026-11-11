//! 文件服务。
//!
//! - [`record`]：按业务 id 查询/回溯本地文件记录
//! - [`download`]：按业务 id 远程下载(流式落盘 + SHA-256 + 进度上报)
//! - [`local`]：本地文件管理(列表/过滤/排序/删除/打开)
//! - [`mime`]：扩展名/文件类型推断(纯函数)

mod download;
mod local;
mod mime;
mod record;

pub use local::{delete_local_file_service, get_local_file_list_service, open_local_file_service};
pub use record::{get_file_by_biz_id_service, has_local_chat_file_service};
