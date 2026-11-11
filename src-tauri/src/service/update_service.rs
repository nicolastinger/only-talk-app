//! 应用自更新服务(GitHub Releases 分发):
//! - `get_latest_release`: 查询最新版本 + 按平台筛选安装包资产
//! - `download_update_package`: 下载更新包 + SHA-256 校验(用 GitHub 自动生成的 digest)
//! - `install_update`: Windows 静默安装(NSIS /S), Android 走系统安装器(复用 open_local_file_service)

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context};
use reqwest::StatusCode;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};

use crate::config::DEFAULT_GITHUB_REPO;
use crate::models::vo::update_vo::UpdateInfo;
use crate::utils::events;
use crate::utils::http_client::{http_client_30, http_client_600};

fn github_repo() -> String {
    crate::config::get_config(crate::utils::global_static_str::CONFIG_UPDATE_GITHUB_REPO)
        .unwrap_or_else(|| DEFAULT_GITHUB_REPO.to_string())
}

/// GitHub Release 响应结构(仅解析用到的字段, 字段均为 snake_case)。
#[derive(Debug, serde::Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: Option<i64>,
    /// SHA-256 摘要(GitHub 自动生成, 小写 hex)
    digest: Option<String>,
}

/// 强制更新标记(写在 release body 里)。
const FORCE_UPDATE_MARKER: &str = "<!-- force-update -->";

/// 按平台筛选安装包资产:
/// - Android: `.apk`, 按当前进程 ABI 精确匹配分包, universal 兜底
/// - Windows: `.exe`(NSIS) 优先, 其次 `.msi`
/// - 其他桌面平台: 暂不支持自动安装, 返回 None
#[cfg(target_os = "android")]
fn pick_asset(assets: &[GitHubAsset]) -> Option<GitHubAsset> {
    // 每个分包 APK 只带自己那份 .so, 因此运行时二进制架构 == 当前安装包的 ABI
    pick_apk_for_arch(assets, std::env::consts::ARCH)
}

/// 资产文件名里是否带"可识别的架构信息"(用于判断历史单包资产能否直接使用)
#[cfg(any(target_os = "android", test))]
fn has_arch_token(name: &str) -> bool {
    const TOKENS: [&str; 6] = ["arm64", "aarch64", "armeabi", "armv7", "x86_64", "x86"];
    let n = name.to_ascii_lowercase();
    TOKENS.iter().any(|t| n.contains(t))
}

/// 资产文件名是否匹配目标架构(大小写不敏感)。
/// 注意 `arm64` 也包含子串 `arm`, `x86_64` 也包含 `x86`, 因此必须先判断 64 位再判断 32 位。
#[cfg(any(target_os = "android", test))]
fn asset_matches_arch(name: &str, arch: &str) -> bool {
    let n = name.to_ascii_lowercase();
    match arch {
        "aarch64" => n.contains("arm64") || n.contains("aarch64"),
        // 分包产物名为 armeabi-v7a; 兼容历史产物名(app-arm-release.apk)
        "arm" => {
            (n.contains("armeabi") || n.contains("armv7") || n.contains("arm-"))
                && !n.contains("arm64")
        }
        "x86_64" => n.contains("x86_64"),
        "x86" => n.contains("x86") && !n.contains("x86_64"),
        _ => false,
    }
}

/// 从 release 资产里挑出匹配当前架构的 APK(优先级从高到低):
///   1. 与当前 ABI 精确匹配的分包(如 `Only.Talk_1.0.4_arm64-v8a.apk`)
///   2. universal 包(包含全部 ABI, 体积大但一定能装)
///   3. 名称里完全没有架构信息的单个 APK(历史上传的单包形态)
///
/// 都不满足则返回 None: 宁可提示"已是最新", 也不要把错误 ABI 的包装到设备上
/// (64 位设备装 32 位包会因 ABI 不兼容而安装失败)。
#[cfg(any(target_os = "android", test))]
fn pick_apk_for_arch(assets: &[GitHubAsset], arch: &str) -> Option<GitHubAsset> {
    let apks: Vec<&GitHubAsset> =
        assets.iter().filter(|a| a.name.to_ascii_lowercase().ends_with(".apk")).collect();

    if let Some(a) = apks.iter().find(|a| asset_matches_arch(&a.name, arch)) {
        return Some((*a).clone());
    }
    if let Some(a) = apks.iter().find(|a| a.name.to_ascii_lowercase().contains("universal")) {
        return Some((*a).clone());
    }
    let unknown: Vec<&&GitHubAsset> = apks.iter().filter(|a| !has_arch_token(&a.name)).collect();
    if let [only] = unknown.as_slice() {
        return Some((**only).clone());
    }
    None
}

#[cfg(windows)]
fn pick_asset(assets: &[GitHubAsset]) -> Option<GitHubAsset> {
    let mut list: Vec<GitHubAsset> = assets
        .iter()
        .filter(|a| {
            let name = a.name.to_lowercase();
            name.ends_with(".exe") || name.ends_with(".msi")
        })
        .cloned()
        .collect();
    list.sort_by_key(|a| if a.name.to_lowercase().ends_with(".exe") { 0 } else { 1 });
    list.into_iter().next()
}

#[cfg(all(desktop, not(windows)))]
fn pick_asset(_assets: &[GitHubAsset]) -> Option<GitHubAsset> {
    None
}

/// 查询 GitHub Releases 最新版本并筛选当前平台的安装包。
pub async fn get_latest_release() -> Result<Option<UpdateInfo>, anyhow::Error> {
    let repo = github_repo();
    if repo.is_empty() {
        return Ok(None);
    }
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let client = http_client_30();

    let resp = client
        .get(&url)
        .header("User-Agent", "OnlyTalk-Updater")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .with_context(|| "访问 GitHub Releases 失败")?;

    // 尚无任何发布时 GitHub 返回 404, 视为"无新版本"
    if resp.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(anyhow!("GitHub API 请求失败: HTTP {}", resp.status()));
    }

    let release: GitHubRelease =
        resp.json().await.with_context(|| "解析 GitHub Release 响应失败")?;
    let asset = match pick_asset(&release.assets) {
        Some(asset) => asset,
        None => return Ok(None),
    };
    let body = release.body.unwrap_or_default();

    Ok(Some(UpdateInfo {
        version: release.tag_name.trim_start_matches('v').to_string(),
        tag_name: release.tag_name,
        notes: body.clone(),
        published_at: release.published_at.unwrap_or_default(),
        file_name: asset.name,
        download_url: asset.browser_download_url,
        size: asset.size.unwrap_or(0),
        sha256: asset.digest,
        force_update: body.contains(FORCE_UPDATE_MARKER),
    }))
}

/// 更新包下载目录:
/// - Android: `cache/open`(tauri-plugin-view 经 FileProvider cache-path 可直接访问)
/// - Windows: 系统"下载"目录, 失败回退应用数据目录
#[cfg(target_os = "android")]
fn update_download_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, anyhow::Error> {
    let cache = app.path().cache_dir().context("获取缓存目录失败")?;
    Ok(cache.join("open"))
}

#[cfg(windows)]
fn update_download_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, anyhow::Error> {
    if let Ok(dir) = app.path().download_dir() {
        return Ok(dir);
    }
    let data = app.path().app_data_dir().context("获取应用数据目录失败")?;
    Ok(data.join("updates"))
}

#[cfg(all(desktop, not(windows)))]
fn update_download_dir<R: Runtime>(_app: &AppHandle<R>) -> Result<PathBuf, anyhow::Error> {
    Err(anyhow!("当前平台暂不支持自动更新下载"))
}

/// 字节数组转小写十六进制字符串。
fn hex_lower(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// 下载进度事件负载(事件名 `update_download_progress`)。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    file_name: String,
    downloaded: u64,
    total: u64,
}

/// 下载更新包到本地并校验 SHA-256(返回本地绝对路径)。
/// 下载过程通过 `update_download_progress` 事件上报进度(总大小优先取 Content-Length, 回退 release 资产 size)。
pub async fn download_update_package<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    file_name: String,
    sha256: Option<String>,
    size: Option<u64>,
) -> Result<String, anyhow::Error> {
    let dest_dir = update_download_dir(&app)?;
    std::fs::create_dir_all(&dest_dir).with_context(|| "创建更新下载目录失败")?;
    let target = dest_dir.join(&file_name);

    let client = http_client_600();
    let mut resp = client.get(&url).send().await.with_context(|| "下载更新包失败")?;
    if !resp.status().is_success() {
        return Err(anyhow!("下载更新包失败: HTTP {}", resp.status()));
    }
    // 总大小: 优先响应头 Content-Length, 回退 GitHub Release 资产 size(未知则为 0)
    let total = resp.content_length().or(size).unwrap_or(0);

    let mut file = File::create(&target).with_context(|| "创建更新包文件失败")?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();

    while let Some(chunk) = resp.chunk().await.with_context(|| "读取更新包内容失败")? {
        file.write_all(&chunk).with_context(|| "写入更新包失败")?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        // 节流: 最快每 100ms 上报一次, 避免高频事件
        if last_emit.elapsed() >= Duration::from_millis(100) {
            let _ = events::emit(
                "update_download_progress",
                DownloadProgress { file_name: file_name.clone(), downloaded, total },
            );
            last_emit = Instant::now();
        }
    }
    file.flush().with_context(|| "写入更新包失败")?;
    // 完成时补发一次最终进度
    let _ = events::emit(
        "update_download_progress",
        DownloadProgress { file_name: file_name.clone(), downloaded, total },
    );

    // SHA-256 校验(GitHub digest 形如 "sha256:<小写 hex>"; 旧资产 digest 可能为空则跳过)
    if let Some(expected) = sha256.as_deref().filter(|s| !s.trim().is_empty()) {
        let expected = expected.trim();
        let expected_hex = expected.split_once(':').map(|(_, hex)| hex).unwrap_or(expected);
        let actual = hex_lower(&hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_hex) {
            let _ = std::fs::remove_file(&target);
            return Err(anyhow!("更新包校验失败: SHA-256 不匹配"));
        }
    }

    Ok(target.to_string_lossy().into_owned())
}

/// 安装更新包:
/// - Windows: 以可见向导方式(非 `/S`)启动 NSIS 安装器, 展示完整安装向导让用户看到更新动作;
///   运行中的本进程由安装器内置的 CheckIfAppIsRunning 检测并提示关闭, 完成页可勾选“运行 Only Talk”启动新版本
/// - Android: 复用 open_local_file_service, 经 FileProvider + ACTION_VIEW 调起系统安装器
#[cfg(windows)]
pub async fn install_update<R: Runtime>(_app: AppHandle<R>, path: String) -> Result<(), String> {
    use std::process::Command;

    Command::new(&path).spawn().map_err(|e| {
        log::error!("启动安装器失败: {}", e);
        e.to_string()
    })?;
    Ok(())
}

#[cfg(target_os = "android")]
pub async fn install_update<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    crate::service::file_service::open_local_file_service(app, path).await
}

#[cfg(all(desktop, not(windows)))]
pub async fn install_update<R: Runtime>(_app: AppHandle<R>, _path: String) -> Result<(), String> {
    Err("当前平台暂不支持自动更新安装".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> GitHubAsset {
        GitHubAsset {
            name: name.to_string(),
            browser_download_url: format!("https://example.com/{name}"),
            size: Some(1),
            digest: None,
        }
    }

    fn pick(names: &[&str], arch: &str) -> Option<String> {
        let assets: Vec<GitHubAsset> = names.iter().map(|n| asset(n)).collect();
        pick_apk_for_arch(&assets, arch).map(|a| a.name)
    }

    /// 新命名(Only.Talk_<版本>_<架构>.apk): 按设备 ABI 精确挑选
    #[test]
    fn picks_split_apk_matching_device_abi() {
        let assets = [
            "Only.Talk_1.0.4_armeabi-v7a.apk",
            "Only.Talk_1.0.4_arm64-v8a.apk",
            "Only.Talk_1.0.4_universal.apk",
            "Only.Talk_1.0.4_x64-setup.exe",
        ];
        assert_eq!(pick(&assets, "aarch64").as_deref(), Some("Only.Talk_1.0.4_arm64-v8a.apk"));
        assert_eq!(pick(&assets, "arm").as_deref(), Some("Only.Talk_1.0.4_armeabi-v7a.apk"));
    }

    /// 顺序无关: 32 位分包排在前面时, 64 位设备也必须拿到 64 位包(历史 bug)
    #[test]
    fn picks_by_abi_regardless_of_asset_order() {
        let assets = ["app-arm-release.apk", "app-arm64-release.apk"];
        assert_eq!(pick(&assets, "aarch64").as_deref(), Some("app-arm64-release.apk"));
        assert_eq!(pick(&assets, "arm").as_deref(), Some("app-arm-release.apk"));
    }

    /// 历史产物名(app-arm64-release.apk / app-arm-release.apk)兼容
    #[test]
    fn supports_legacy_asset_names() {
        let assets = ["Only.Talk_1.0.4_aarch64.apk", "Only.Talk_1.0.4_armv7.apk"];
        assert_eq!(pick(&assets, "aarch64").as_deref(), Some("Only.Talk_1.0.4_aarch64.apk"));
        assert_eq!(pick(&assets, "arm").as_deref(), Some("Only.Talk_1.0.4_armv7.apk"));
    }

    /// x86 与 x86_64 不能互相误判
    #[test]
    fn distinguishes_x86_from_x86_64() {
        let assets = ["Only.Talk_1.0.4_x86.apk", "Only.Talk_1.0.4_x86_64.apk"];
        assert_eq!(pick(&assets, "x86_64").as_deref(), Some("Only.Talk_1.0.4_x86_64.apk"));
        assert_eq!(pick(&assets, "x86").as_deref(), Some("Only.Talk_1.0.4_x86.apk"));
    }

    /// 没有匹配的分包时回退到 universal(全 ABI)
    #[test]
    fn falls_back_to_universal() {
        let assets = ["Only.Talk_1.0.4_armeabi-v7a.apk", "Only.Talk_1.0.4_universal.apk"];
        assert_eq!(pick(&assets, "aarch64").as_deref(), Some("Only.Talk_1.0.4_universal.apk"));
    }

    /// 精确匹配优先于 universal
    #[test]
    fn prefers_exact_abi_over_universal() {
        let assets = ["Only.Talk_1.0.4_universal.apk", "Only.Talk_1.0.4_arm64-v8a.apk"];
        assert_eq!(pick(&assets, "aarch64").as_deref(), Some("Only.Talk_1.0.4_arm64-v8a.apk"));
    }

    /// 只有其它 ABI 的包时不返回任何结果(宁可提示最新, 也不装错 ABI)
    #[test]
    fn refuses_mismatched_abi() {
        let assets = ["Only.Talk_1.0.4_armeabi-v7a.apk"];
        assert_eq!(pick(&assets, "aarch64"), None);
    }

    /// 名称里没有架构信息的历史单包仍可使用, 但有多个时不做猜测
    #[test]
    fn uses_single_apk_without_arch_token_only() {
        assert_eq!(pick(&["OnlyTalk.apk"], "aarch64").as_deref(), Some("OnlyTalk.apk"));
        assert_eq!(pick(&["a.apk", "b.apk"], "aarch64"), None);
    }

    /// 没有 apk 资产时返回 None
    #[test]
    fn ignores_non_apk_assets() {
        assert_eq!(
            pick(&["Only.Talk_1.0.4_x64-setup.exe", "Only.Talk_1.0.4_amd64.deb"], "aarch64"),
            None
        );
    }
}
