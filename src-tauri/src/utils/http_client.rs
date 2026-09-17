//! 全局共享 `reqwest::Client`(任务08 §5): 连接池 + keep-alive 复用, 避免每次请求重建 TCP+TLS。

use std::sync::OnceLock;
use std::time::Duration;

use reqwest::Client;

/// 构建带超时的 Client; 构建失败(理论不可达)回退默认实例。
fn build_with_timeout(secs: u64) -> Client {
    Client::builder().timeout(Duration::from_secs(secs)).build().unwrap_or_else(|_| Client::new())
}

/// 默认共享 Client(无显式超时)。
pub fn http_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(Client::new)
}

/// 30s 超时共享 Client(普通 API)。
pub fn http_client_30() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| build_with_timeout(30))
}

/// 120s 超时共享 Client(中等上传)。
pub fn http_client_120() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| build_with_timeout(120))
}

/// 300s 超时共享 Client(大文件上传)。
pub fn http_client_300() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| build_with_timeout(300))
}
