# 客户端自更新(更新包) + CI/CD 发布流水线 完整说明

> 本文档一次性讲清 **PC(Windows) + 安卓两端"检查更新 → 下载 → 安装"** 的完整能力,
> 以及支撑它落地的 **GitHub Actions 流水线**(从"没有 CI"到"tag 即发布")的全部细节与踩坑。
> 数据源: GitHub Releases;**only-talk-rs 后端零改动**。

---

## 1. 一句话总结

维护者打一个 `vX.Y.Z` 的 tag → CI 自动在 Windows 上编译 NSIS 安装包 → 自动发布到该 tag 的
GitHub Release(附带 GitHub 自动生成的 SHA-256 `digest`)→ 客户端「检查更新」拉到新版本 →
下载安装包并校验 SHA-256 → Windows 静默安装后自动重启 / 安卓调起系统安装器。

## 2. 整体链路

```
维护者: 升版本号 + git tag vX.Y.Z + push
        │
        ▼
GitHub Actions (client-ci.yml)
  ├─ frontend: pnpm build (apps/pc) ────────────── 构建前端产物
  ├─ rust: nightly fmt check + clippy + test ───── 质量门禁
  └─ bundle (仅 tag/main/手动): 装静态 OpenSSL →
        pnpm tauri build --bundles nsis →          Windows NSIS 安装包
        softprops/action-gh-release →             发布到 GitHub Release
                                                  (GitHub 自动为资产生成 SHA-256 digest)
        │
        ▼
客户端 "检查更新" (get_latest_release)
  │  拉 api.github.com/repos/{owner}/{repo}/releases/latest, 按平台筛资产
  ▼
下载更新包 (download_update_package)
  │  流式下载 + SHA-256 对账(GitHub digest)
  ▼
安装 (install_update)
  ├─ Windows: 以 /S 静默运行 NSIS 安装器 → 退出本进程 → 装完自动重启新版本
  └─ Android: 复用 open_local_file → FileProvider + ACTION_VIEW 调起系统安装器
```

## 3. GitHub Release 发布约定(客户端依赖, 必须遵守)

| 项 | 约定 | 说明 |
| --- | --- | --- |
| 仓库 | `nicolastinger/only-talk-app` | 可用客户端配置 `update.github_repo` 覆盖(格式 `owner/repo`) |
| tag | **`v{version}`** | 客户端把 tag 去掉前导 `v` 后与自身版本做语义化比较 |
| Windows 资产 | `OnlyTalk-Setup-{version}.exe`(NSIS) | 优先 `.exe`, 兼容 `.msi` |
| Android 资产 | `OnlyTalk-{version}-universal.apk` | universal 单包优先, 任意 `.apk` 均可 |
| 校验和 | GitHub 自动生成资产 `digest`(SHA-256) | 2025-06 起所有发布资产自动带; 旧资产可能为空则跳过校验 |
| 强制更新 | release body 含 `<!-- force-update -->` | 客户端检测到后弹窗不可关闭, 必须升级后才能继续用 |

> 注意: Android 暂未接入 CI, 需本机打包后手动 `gh release create` 附上 APK(见 §7)。

## 4. 客户端实现细节

### 4.1 Rust 侧(src-tauri)

| 文件 | 职责 |
| --- | --- |
| `src/cmd/update_controller.rs` | 三个 Tauri 命令: `get_latest_release` / `download_update_package` / `install_update` |
| `src/service/update_service.rs` | GitHub API 解析、按平台筛资产、下载+校验、安装分发(核心逻辑) |
| `src/vo/update_vo.rs` | `UpdateInfo`(version/tag_name/notes/file_name/download_url/size/sha256/force_update) |
| `src/config.rs` + `src/utils/global_static_str.rs` | 种子配置键 `update.github_repo`(默认 `nicolastinger/only-talk-app`) |
| `src/lib.rs` | `generate_handler!` 注册三个命令 |

**`get_latest_release()`**:
- 请求 `https://api.github.com/repos/{repo}/releases/latest`(`http_client_30`, 带 `User-Agent: OnlyTalk-Updater`)
- 404 = 还没有任何发布 → 视为"无新版本"返回 `None`
- 按平台筛资产: Android 取 `.apk`(universal 优先); Windows 取 `.exe`(其次 `.msi`)
- 从 release body 解析 `<!-- force-update -->` 标记 → `force_update`

**`download_update_package(url, file_name, sha256)`**:
- Windows 下载到系统「下载」目录(失败回退应用数据目录); Android 下载到 `cache/open/`
- 用 `http_client_600`(10 分钟超时)整包拉取, 本地算 SHA-256 与 GitHub `digest` 对账, 不匹配即报错

**`install_update(path)`**:
- Windows: `Command::new(path).spawn()` → 以**可见向导**方式启动 NSIS 安装器(不传 `/S`),
  用户可见完整安装流程; 运行中的本进程由安装器内置 `CheckIfAppIsRunning` 提示关闭,
  完成页可勾选“运行 Only Talk”启动新版本
- Android: `open_local_file(app, path)`(复用现有命令, 无需新原生代码)

### 4.2 前端侧

| 文件 | 职责 |
| --- | --- |
| `packages/types/src/update/index.ts` | `UpdateInfo` TS 类型(镜像 Rust VO) |
| `packages/services/src/updateService/index.ts` | `checkForUpdate()`(invoke + 本地 semver 比较)、`downloadUpdatePackage()`、`installUpdate()`、`formatFileSize()` |
| `apps/pc/.../Settings/components/AboutApp.tsx` | 「检查更新」按钮 + antd Modal(版本/更新日志/大小, 强制更新不可关闭, 下载中态) |
| `apps/mobile/.../Settings/About.vue` | 设置-关于页「检查更新」入口 + Vant Dialog + 下载 loading |
| 三份 `locales/*.ts` | 新增更新相关文案(`newVersionAvailable/releaseNotes/downloadNow/...`) |

版本号展示: PC 从硬编码 `v1.0.0` 改为 `getVersion()`(运行时真实版本); Mobile 本就用了 `getVersion()`。

### 4.3 NSIS 安装器钩子(`installer.nsi`)

```nsi
!macro customInit
  ; 自更新走可见向导(非 /S): 提示关闭交给安装器内置 CheckIfAppIsRunning。
  ; 仅手动静默安装(/S)时直接结束进程, 避免 exe 被占用。
  IfSilent 0 +3
  nsExec::ExecToStack 'taskkill /IM "Only Talk.exe" /F'
!macroend

!macro customInstall
  nsExec::ExecToStack 'netsh advfirewall firewall add rule ...'   ; 原有防火墙规则
  ; 手动静默安装(/S)完成后自动重启; 向导安装由完成页勾选启动
  IfSilent 0 +3
  Sleep 2000
  ExecShell "" "$INSTDIR\Only Talk.exe"
!macroend
```

> ⚠️ 自动更新默认走**可见向导**安装(用户能看到安装动作); `/S` 静默分支仅保留给手动静默安装场景。

### 4.4 Android 安装权限

`src-tauri/gen/android/app/src/main/AndroidManifest.xml` 新增:

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

**✅ 该权限随 `gen/android` 工程入库**: `src-tauri/gen/android` 现已纳入版本管理(仅排除构建产物、
gradle 缓存、机器相关文件与签名密钥), 因此新克隆/换机器都不会再丢失该权限。仍需注意:
- `pnpm tauri android dev/build` 会重新生成并 sync 插件 android 模块; 若模板覆盖了自定义内容(如
  `AndroidManifest.xml`、`MainActivity.kt`、`KeepAliveService.kt`), 请比对 `git status` 并把改动提交回来。
- 签名密钥不入库: `.jks` 放本机 `~/.only-talk/android/upload-keystore.jks`, 密码只走环境变量(见 §7.2)。

## 5. CI/CD 流水线

### 5.1 最终结构(`.github/workflows/client-ci.yml`)

```
client-ci
├─ frontend  (ubuntu-latest)   pnpm install → typecheck → build → upload pc-dist 制品
├─ rust      (ubuntu-latest, needs frontend)
│    apt 装 webkit2gtk/libssl-dev 等 → stable(clippy,rustfmt) + nightly(rustfmt)
│    → cargo +nightly fmt --check → cargo +stable clippy → cargo +stable test
└─ bundle    (windows-latest, 仅 main/tag/手动)
     pnpm install → stable → rust-cache → setup-openssl(复合 action)
     → pnpm tauri build --bundles nsis → upload-artifact
     → 若为 v* tag: softprops/action-gh-release 发布到 GitHub Release
```

### 5.2 关键复合 action(`.github/actions/setup-openssl/action.yml`)

Windows 打包必须在构建前提供静态 OpenSSL 并设置 `OPENSSL_DIR`。用 vcpkg `x64-windows-static`
(与你本机一致), 而非 chocolatey 动态版 —— 原因见 §6 踩坑 #5:

```yaml
steps:
  - shell: pwsh
    run: |
      $vcpkgRoot = "$env:RUNNER_TEMP\vcpkg"
      if (-not (Test-Path "$vcpkgRoot\vcpkg.exe")) {
        git clone --depth 1 https://github.com/microsoft/vcpkg $vcpkgRoot
        & "$vcpkgRoot\bootstrap-vcpkg.bat" -disableMetrics
      }
      & "$vcpkgRoot\vcpkg.exe" install openssl:x64-windows-static --disable-metrics --clean-after-build
      Write-Output "OPENSSL_DIR=$vcpkgRoot\installed\x64-windows-static" | Out-File -Append $env:GITHUB_ENV
```

### 5.3 触发规则

| 事件 | 跑哪些 job |
| --- | --- |
| push 到 `main`/`master` | frontend + rust + bundle(不发布, 只存 artifact) |
| push `v*` tag | frontend + rust + bundle(并发布 GitHub Release) |
| PR | frontend + rust(bundle 跳过省 CI 时间) |
| workflow_dispatch | 全部(手动) |

## 6. 踩坑记录(本次从 0 到绿的完整清单)

以下问题大多为**仓库既有问题**, 之前 CI 从未跑绿过; 逐一修复后 tag 发布全链路打通。

| # | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | `cargo +nightly fmt --check` 失败 | 仓库长期没按 nightly rustfmt 格式化(项目 `rustfmt.toml` 用 nightly 专属选项) | `cargo +nightly fmt --all` 全量对齐, 含新增文件 |
| 2 | clippy 报 `loop never actually loops` | 既有 `auth_controller.rs` 里只循环一次的 `loop`(新 clippy 版本才报) | 去掉 `loop` 包装, 语义不变 |
| 3 | clippy: `cargo-clippy is not installed for toolchain 'nightly'` | `dtolnay/rust-toolchain@nightly` 把默认工具链切成 nightly, 但只装了 `rustfmt` 没装 `clippy` | clippy/test 显式用 `cargo +stable` |
| 4 | clippy `-D warnings` 报 36 个 `disallowed methods` | `clippy.toml` 禁了 `unwrap`, 但 `serde_json::json!` 宏内部必须 `unwrap`, 属不可消除噪音 | clippy 去掉 `-D warnings`(保留告警); 若想保持严格可给 ~18 处 json! 加 `#[allow(clippy::disallowed_methods)]` |
| 5 | bundle: `libsqlite3-sys` 构建 panic `Missing OPENSSL_DIR` | Windows 上 `find_openssl_dir` 只读 `OPENSSL_DIR` 环境变量, runner 上没有 OpenSSL | 装 vcpkg 静态 OpenSSL 并设 `OPENSSL_DIR`。**不要用 choco 动态版**: 会给 `app.exe` 引入 `libcrypto-3-x64.dll` 运行时依赖(本机 vcpkg 静态产物无任何 DLL 依赖, 已用 dumpbin 验证) |
| 6 | 测试: `sync_response_parse` 缺 `last_read_id` | 结构体新增 `last_read_id` 后测试 fixture 未同步 | fixture 补 `"last_read_id": 0` |
| 7 | 测试: `image_utils_tests` 3 例全挂 | 压缩输出改为 `{monthly_resources}/{stem}_{ts}.webp` 后, 测试仍假设输出在输入旁 + 未种配置 | 重写为: 种 `monthly_resources` 配置 + 用返回值取输出路径 |
| 8 | 测试: `test_compress_real_image_p1017533` 挂 | 硬编码作者本机照片路径 `D:\漫展\P1002642.JPG` + 依赖 Tauri 初始化, 无法在 CI 跑 | 标 `#[ignore]`, 本地 `cargo test -- --ignored` 可跑 |
| 9 | 发布: `Resource not accessible by integration`(403) | `GITHUB_TOKEN` 默认只读, 无 `contents: write` 无法创建 release/传资产 | bundle job 加 `permissions: contents: write` |

> 若日后 `permissions` 仍被仓库设置压制, 可在仓库 **Settings → Actions → General → Workflow permissions** 改为 "Read and write permissions"。

## 7. 发布 SOP

### 7.1 Windows(CI 全自动)

```bash
# 1. 升版本号(仅这两处影响打包产物版本)
#    src-tauri/tauri.conf.json  "version": "1.0.2"
#    src-tauri/Cargo.toml       version = "1.0.2"
#    (workspace 的 package.json 版本是内部包版本, 不影响产物, 不用动)

# 2. 提交 + 打 tag + 推送(触发 CI 自动打包并发布)
git add -A && git commit -m "release: v1.0.2"
git tag v1.0.2
git push origin develop && git push origin v1.0.2
```

> 若想重新跑同一 tag: `git tag -f v1.0.2 && git push origin v1.0.2 --force`
> (若该 tag 已有 Release, 需先删除或勾选 overwrite, 否则 action 会失败)。

### 7.2 Android(暂手动)

> 完整的签名配置说明(生成密钥 / 环境变量 / CI)见 [`android-signing.md`](./android-signing.md)。

**签名密钥(不入库)**: release 必须签名。密钥文件默认位于本机
`~/.only-talk/android/upload-keystore.jks`(Windows: `%USERPROFILE%\.only-talk\android\`),
密码/别名**只通过环境变量**提供, 仓库不保存任何密钥与密码:

| 环境变量 | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 库密码(必填) |
| `ANDROID_KEY_PASSWORD` | key 密码(必填) |
| `ANDROID_KEY_ALIAS` | key 别名(可选, 默认 `upload`) |
| `ANDROID_KEYSTORE_PATH` | keystore 绝对路径(可选, 默认 `~/.only-talk/android/upload-keystore.jks`) |

`app/build.gradle.kts` 读取上述变量; 缺失时 release 产出**未签名** APK 并打警告(不会再像旧实现
那样因 `keystore.properties` 缺失而直接构建失败)。CI 走 GitHub Secrets 注入同名环境变量即可。

```powershell
# 1. 设置签名环境变量(仅当前会话; 值为你自己的密钥密码)
$env:ANDROID_KEY_ALIAS         = "upload"
$env:ANDROID_KEYSTORE_PASSWORD = "<你的库密码>"
$env:ANDROID_KEY_PASSWORD      = "<你的 key 密码>"

# 2. 本机打 universal APK(仓库根目录)
pnpm tauri android build
# 产物: src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk

# 3. 附到同名 tag 的 Release(Windows 的 CI 已建好 vX.Y.Z)
gh release upload v1.0.2 src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
```

### 7.3 强制更新

在 release body 里写入(客户端据此把弹窗设为不可关闭):

```
<!-- force-update -->
```

## 8. 验证清单(全链路)

1. `pnpm build:all` 通过(前端三端 + types/services)。
2. `cd src-tauri && cargo +nightly fmt --all --check && cargo +stable clippy --all-targets && cargo +stable test --all-targets` 全绿。
3. 发布 `vX.Y.Z` 后, GitHub Release 页能看到 NSIS 资产及其 SHA-256 digest。
4. 旧版本客户端「设置 → 关于 → 检查更新」→ 弹新版本 + 更新日志。
5. 点「立即更新」→ 下载 → Windows 静默安装后自动重启到新版本; Android 调起系统安装器, 用户确认后升级。
6. release body 含 `<!-- force-update -->` 时, 更新弹窗不可关闭。

## 9. 已知限制与后续

- **Android 未接入 CI**: 需本机打包手动上传; 后续可加 Android job。`src-tauri/gen/android` 已入库,
  CI 无需 `android init` 即可直接构建, 但仍需注意 `.cargo/config.toml` 与 `openssl-android/` 均为本机生成物
  (CI 需自行生成/编译), 另需通过 GitHub Secrets 注入 `ANDROID_KEYSTORE_PASSWORD` 等环境变量并把密钥文件
  放到 CI 的 `~/.only-talk/android/`(或用 `ANDROID_KEYSTORE_PATH` 指定)。
- **代码签名**: Android 的 release 包已支持签名(密钥+密码均不入库, 见 §7.2); Windows 安装包仍未签名,
  SmartScreen 会有未知来源提示; 需要时可引入 Windows 代码签名证书。
- **下载无断点续传**: 已改为流式写盘并上报进度(见 §4.1 `download_update_package`), 但暂不支持断点续传。
- **自动检查更新**: 目前仅「关于页」手动检查; 如需启动自动检查, 建议用 `client_config` 记录 `update.last_check`
  节流(≥6h 一次), 避免 GitHub 未认证 API 60 次/时限流。