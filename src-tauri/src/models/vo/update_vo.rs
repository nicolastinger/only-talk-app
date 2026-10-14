use serde::Serialize;

/// 最新版本信息(get_latest_release 返回, 数据源 GitHub Releases)。
#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    /// 最新版本号(去掉前导 v), 如 1.0.1
    pub version: String,
    /// 最新版本原始 tag, 如 v1.0.1
    pub tag_name: String,
    /// 更新日志(release body)
    pub notes: String,
    /// 发布时间(RFC3339)
    pub published_at: String,
    /// 匹配当前平台/架构的资产文件名, 如 OnlyTalk-Setup-1.0.1.exe / only-talk-1.0.1-universal.apk
    pub file_name: String,
    /// 资产下载地址(browser_download_url)
    pub download_url: String,
    /// 资产大小(字节)
    pub size: i64,
    /// SHA-256 摘要(GitHub 自动生成的 digest, 小写 hex; 旧资产可能为 null)
    pub sha256: Option<String>,
    /// 是否强制更新(release body 含 `<!-- force-update -->` 标记)
    pub force_update: bool,
}
