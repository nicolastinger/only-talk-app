pub static DOMAIN_NAME: &str = "onlytalk.local";

pub static REDIS_SPLIT: &str = ":";
pub static REDIS_QUIC_SERVERS: &str = "QUIC:SERVER:";
pub static SYSTEM: &str = "system";

pub static PING: &str = "ping";
pub static PONG: &str = "pong";

pub static TALK_API: &str = "https://onlytalk.local:8443";

pub static UDP_SOCKET: &str = "REDACTED_SERVER_IP_1:9562";
pub static UDP_SOCKET_2: &str = "REDACTED_SERVER_IP_1:9564";

pub static UDP_SOCKET_V6: &str = "[REDACTED_IPV6]:9563";
pub static UDP_SOCKET_V6_2: &str = "[REDACTED_IPV6]:9565";

pub static QUIC_SERVER_ADDR: &str = "REDACTED_SERVER_IP_1:4433";

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
// 加密key
pub static PRIVATE_DB_KEY: &str = "REDACTED_DB_ENCRYPTION_KEY";
// 默认图片
pub static DEFAULT_IMAGE: &str = "default.jpg";
// 消息链第一个节点
pub static MSG_LINK_FIRST_NODE: &str = "first_node";
// 全0的UUID
pub static ZERO_UUID: &str = "00000000-0000-0000-0000-000000000000";
// 平台
#[cfg(desktop)]
pub static PLATFORM: u8 = 0;  // PC
#[cfg(not(desktop))]
pub static PLATFORM: u8 = 1;  // MOBILE;
