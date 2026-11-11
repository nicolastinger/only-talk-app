pub static DOMAIN_NAME: &str = "onlytalk.cn";

pub static REDIS_SPLIT: &str = ":";
pub static REDIS_QUIC_SERVERS: &str = "QUIC:SERVER:";
pub static SYSTEM: &str = "system";

pub static PING: &str = "ping";
pub static PONG: &str = "pong";

pub static TALK_API: &str = "https://onlytalk.cn";

// ---------------- 客户端配置键(持久化到公共库 client_config 表) ----------------
pub static CONFIG_SERVER_API_BASE: &str = "server.api_base";
pub static CONFIG_SERVER_DOMAIN: &str = "server.domain";
pub static CONFIG_APP_THEME: &str = "app.theme";
pub static CONFIG_APP_LANGUAGE: &str = "app.language";
pub static CONFIG_APP_MESSAGE_SOUND: &str = "app.message_sound";
pub static CONFIG_APP_DO_NOT_DISTURB: &str = "app.do_not_disturb";
pub static CONFIG_APP_DO_NOT_DISTURB_START: &str = "app.do_not_disturb_start";
pub static CONFIG_APP_DO_NOT_DISTURB_END: &str = "app.do_not_disturb_end";
pub static CONFIG_APP_AUTO_DOWNLOAD_WIFI: &str = "app.auto_download_wifi";
pub static CONFIG_APP_AUTO_DOWNLOAD_CELLULAR: &str = "app.auto_download_cellular";

// ---------------- 上传大小限制(前后端需保持一致: packages/types 的 UPLOAD_LIMITS) ----------------
/// 图片上传大小上限: 100MB
pub const MAX_IMAGE_UPLOAD_SIZE: u64 = 100 * 1024 * 1024;
/// 普通文件上传大小上限: 500MB
pub const MAX_FILE_UPLOAD_SIZE: u64 = 500 * 1024 * 1024;
pub static CONFIG_UPDATE_GITHUB_REPO: &str = "update.github_repo";

/// HTTP API 基础地址: 优先取配置表 `server.api_base`, 未配置按运行环境兜底。
/// dev → http://127.0.0.1:8443(网关方案后 actix 明文端口); prod → https://onlytalk.cn(nginx 443)。
pub fn talk_api_base() -> String {
    crate::config::get_config(CONFIG_SERVER_API_BASE).unwrap_or_else(|| {
        if get_env() == "dev" {
            "http://127.0.0.1:8443".to_string()
        } else {
            TALK_API.to_string()
        }
    })
}

/// QUIC/NAT 域名: 优先取配置表 `server.domain`, 未配置按运行环境兜底。
pub fn talk_api_domain() -> String {
    crate::config::get_config(CONFIG_SERVER_DOMAIN).unwrap_or_else(|| {
        if get_env() == "dev" {
            "127.0.0.1".to_string()
        } else {
            DOMAIN_NAME.to_string()
        }
    })
}

// 用户发起好友申请
pub static USER_ADD_FRIEND: &str = "USER_ADD_FRIEND_REQUEST";
// 用户处理好友申请
pub static USER_PROCESS_FRIEND: &str = "USER_PROCESS_FRIEND_REQUEST";
// 软件名
pub static APP_NAME: &str = "OnlyTalk";
// 软件包名
pub static PACKAGE_NAME: &str = "com.only-talk.app";
// 本地数据库文件夹
pub static SQLITE_PATH: &str = "dbData";
// 本地资源文件夹
pub static RESOURCE_PATH: &str = "resource";
// 当月资源文件夹
pub static MONTHLY_RESOURCE_PATH: &str = "monthly_resources";
// 日志文件夹
pub static LOG_PATH: &str = "logs";
// 日志文件名
pub static LOG_FILE_NAME: &str = "only_talk.log";
// app_path
pub static APP_PATH: &str = "app_path";
// 用户数据库
pub static USER_DB: &str = "user.db";
// 公共数据库
pub static COMMON_DB: &str = "common.db";
// 加密数据库
pub static PRIVATE_DB: &str = "private.db";
// 默认图片
pub static DEFAULT_IMAGE: &str = "default.jpg";
// 消息链第一个节点
pub static MSG_LINK_FIRST_NODE: &str = "first_node";
// 全0的UUID
pub static ZERO_UUID: &str = "00000000-0000-0000-0000-000000000000";
// 平台
#[cfg(desktop)]
pub static PLATFORM: u8 = 0; // PC
#[cfg(not(desktop))]
pub static PLATFORM: u8 = 1; // MOBILE;

/// 运行环境标识(ONLY_TALK_ENV 环境变量, 未设置默认 prod)
pub fn get_env() -> String {
    std::env::var("ONLY_TALK_ENV").unwrap_or_else(|_| "prod".to_string())
}
