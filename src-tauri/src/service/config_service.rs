//! 持久化配置服务: 公共库 `client_config` 表 ↔ 内存 `GLOBAL_CONFIG`。
//!
//! 内存读写与常量见 `crate::config`; 此处负责与 DB 的同步(种子默认值/写入/重置)。

use log::debug;

use crate::config::{remove_config, set_config, DEFAULT_GITHUB_REPO};
use crate::dao::client_config_db;
use crate::utils::global_static_str::{
    talk_api_base, talk_api_domain, CONFIG_APP_AUTO_DOWNLOAD_WIFI, CONFIG_APP_LANGUAGE,
    CONFIG_APP_THEME, CONFIG_SERVER_API_BASE, CONFIG_SERVER_DOMAIN, CONFIG_UPDATE_GITHUB_REPO,
};

/// 初始化并加载持久化配置(公共库 `client_config` 表 → 内存 `GLOBAL_CONFIG`)。
///
/// 首次启动按运行环境写默认值(仅缺省键):
/// - `server.api_base` / `server.domain`: dev → http://127.0.0.1:8443 / 127.0.0.1, prod → https://onlytalk.cn / onlytalk.cn
/// - `app.theme` = light, `app.language` = zh-CN
/// 随后将整表加载进内存, 供 `talk_api_base()` 等运行时解析使用。
pub async fn init_persisted_config() -> Result<(), anyhow::Error> {
    for (key, default) in [
        (CONFIG_SERVER_API_BASE, talk_api_base()),
        (CONFIG_SERVER_DOMAIN, talk_api_domain()),
        (CONFIG_APP_THEME, "light".to_string()),
        (CONFIG_APP_LANGUAGE, "zh-CN".to_string()),
        (CONFIG_APP_AUTO_DOWNLOAD_WIFI, "1".to_string()),
        (CONFIG_UPDATE_GITHUB_REPO, DEFAULT_GITHUB_REPO.to_string()),
    ] {
        if client_config_db::get_config(key).await?.is_none() {
            client_config_db::set_config(key, &default).await?;
            debug!("种子配置: {} = {}", key, default);
        }
    }

    for row in client_config_db::get_all_configs().await? {
        if let (Some(k), Some(v)) = (row.config_key, row.config_value) {
            set_config(&k, &v);
        }
    }
    Ok(())
}

/// 持久化写配置: 内存 + 公共库 `client_config` 表。
pub async fn persist_config(key: &str, value: &str) -> Result<(), anyhow::Error> {
    client_config_db::set_config(key, value).await?;
    set_config(key, value);
    Ok(())
}

/// 删除配置并恢复为环境默认(表删行 + 重新种子/加载内存)。
pub async fn reset_config(key: &str) -> Result<(), anyhow::Error> {
    client_config_db::delete_config(key).await?;
    remove_config(key);
    init_persisted_config().await?;
    Ok(())
}
