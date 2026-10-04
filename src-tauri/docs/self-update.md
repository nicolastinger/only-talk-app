# 应用自更新(更新包功能)接入说明

> 覆盖 PC(Windows) + 安卓两端。分发源为 **GitHub Releases**,客户端下载安装包后用
> **GitHub 自动生成的 SHA-256 digest** 校验,不依赖自家后端(only-talk-rs 零改动)。

## 1. 整体链路

```
维护者发布 vX.Y.Z Release(附各平台安装包)
        │  GitHub 自动为每个资产生成 SHA-256 digest
        ▼
客户端 检查更新(get_latest_release)
        │  拉 api.github.com/repos/{owner}/{repo}/releases/latest,按平台筛资产
        ▼
下载更新包(download_update_package)
        │  流式下载 + SHA-256 对账
        ▼
安装(install_update)
    ├─ Windows: 以 /S 静默运行 NSIS 安装器 → 退出本进程 → 装完自动重启新版本
    └─ Android: 复用 open_local_file → FileProvider + ACTION_VIEW 调起系统安装器(用户确认)
```

## 2. 发布约定(GitHub Releases)

- 仓库: `nicolastinger/only-talk-app`(可用客户端配置 `update.github_repo` 覆盖, 格式 `owner/repo`)
- **tag 即版本号**: `v{version}`(如 `v1.0.1`),客户端以去掉前导 `v` 的 tag 与当前版本比较
- 资产命名(客户端按此筛选):
  - Windows: `OnlyTalk-Setup-{version}.exe`(NSIS,优先 `.exe`,兼容 `.msi`)
  - Android: `OnlyTalk-{version}-universal.apk`(universal 单包优先,任意 `.apk` 均可)
- **SHA-256**:GitHub 2025-06 起自动为发布资产计算并暴露 `digest` 字段,无需自建校验和
  (旧资产可能没有 `digest`,客户端下载时若为空则跳过校验)
- **强制更新**:在 release body 里写 `<!-- force-update -->` 标记,客户端据此阻止跳过

## 3. CI / 发布流程

- `.github/workflows/client-ci.yml`:tag(`v*`)推送时自动打包 Windows NSIS 并发布到该 tag 的
  GitHub Release(`softprops/action-gh-release`);main 分支仅上传 artifact,不发布。
- Android 暂未接入 CI,需本机打包后手动发布:

```bash
# 1. bump 版本: tauri.conf.json / src-tauri/Cargo.toml / 三个 package.json
# 2. 打包(仓库根目录)
pnpm tauri build                       # Windows → src-tauri/target/release/bundle/nsis/*.exe
pnpm tauri android build               # Android universal APK
# 3. 发布
gh release create vX.Y.Z \
  --title "vX.Y.Z" --notes "$(cat CHANGELOG)" \
  src-tauri/target/release/bundle/nsis/*.exe \
  src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
```

## 4. 客户端实现要点

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 命令 | `src-tauri/src/cmd/update_controller.rs` | `get_latest_release` / `download_update_package` / `install_update` |
| 服务 | `src-tauri/src/service/update_service.rs` | GitHub API 解析、平台资产筛选、下载+校验、安装分发 |
| VO | `src-tauri/src/vo/update_vo.rs` | `UpdateInfo`(version/tag_name/notes/file_name/download_url/size/sha256/force_update) |
| 配置 | `src-tauri/src/config.rs` | 种子键 `update.github_repo`(默认 `nicolastinger/only-talk-app`) |
| 安装器 | `src-tauri/installer.nsi` | `customInit` 静默安装时先 `taskkill` 旧进程;`customInstall` 装完自动重启 |
| 前端 | `packages/services/src/updateService` | `checkForUpdate()` / `downloadAndInstall()` |
| UI | `apps/pc` AboutApp / `apps/mobile` About.vue | 检查/下载/安装入口 |

## 5. 安卓端关键坑(换机器/重拉代码必读)

安卓"检查更新 → 安装 APK"复用 `open_local_file`(`tauri-plugin-view` 经 FileProvider
生成 `content://` URI + `ACTION_VIEW`)。要能调起系统安装器,必须:

- `AndroidManifest.xml` 声明 `android.permission.REQUEST_INSTALL_PACKAGES`(Android 8+ 必需);
  首次安装新 APK 时系统安装器会引导用户允许"安装未知应用"。
- **`src-tauri/gen/android` 是 git 忽略的本地生成产物**。上述 manifest 改动在
  `gen/android/app/src/main/AndroidManifest.xml` 内,**换机器或 `tauri android init` 重建后会丢失**,
  需重新执行 `pnpm tauri android dev/build` 后再次补上(或把该 manifest 纳入模板维护)。
- 用户可能需要在系统设置中为本应用开启"允许安装未知应用",若已开启则直接调起安装器。

## 6. 验证路径

1. 维护者发布 `vX.Y.Z`(Windows exe + Android apk)。
2. 旧版本客户端进入「设置 → 关于」点「检查更新」→ 弹出新版本 + 更新日志。
3. 点「立即更新」→ 下载(带进度)→ Windows 静默安装后自动重启新版本;
   Android 调起系统安装器,确认后升级。
4. release body 含 `<!-- force-update -->` 时,更新弹窗不可关闭。