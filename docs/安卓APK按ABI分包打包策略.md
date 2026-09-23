# 移动端安卓 APK 按 ABI 分包打包策略

## 1. 背景与现状

- 当前直接执行 `pnpm tauri android build`（不带 `--split-per-abi`）时，Tauri 默认打 **universal 包**：一份 APK 里同时打包 `arm64-v8a / armeabi-v7a / x86 / x86_64` 四份 `.so`，包体约 ~100MB。
- 目标是**按 ABI 分包**：分别产出「只含 64 位 ARM」和「只含 32 位 ARM」的独立 APK，每个包体积显著缩小（预计 ~27MB 级）。
- **AAB（Android App Bundle）本次不处理**，保持现状。AAB 本身由应用市场按设备自动分包，不在此策略范围内。
- 移动端构建使用独立的 `src-tauri/tauri.android.conf.json`（与 PC 的 `tauri.conf.json` 分离），详见第 3 节。

## 2. 分包策略

## 2. 分包策略

### 2.1 支持的架构

| `--target` | Rust 编译 target          | ABI 目录名    | Gradle flavor | 状态                |
| ---------- | ------------------------- | ------------- | ------------- | ------------------- |
| `aarch64`  | `aarch64-linux-android`   | `arm64-v8a`   | `arm64`       | ✅ 启用             |
| `armv7`    | `armv7-linux-androideabi` | `armeabi-v7a` | `arm`         | ✅ 启用             |
| `i686`     | `i686-linux-android`      | `x86`         | `x86`         | ⏳ 占位（暂不启用） |
| `x86_64`   | `x86_64-linux-android`    | `x86_64`      | `x86_64`      | ⏳ 占位（暂不启用） |

> **x86 占位说明**：`gen/android` 中的 `RustPlugin.kt` 已内置 `x86 / x86_64` 对应的 productFlavor，无需额外改动。日后需要支持 x86 模拟器或 x86 设备时，只需在构建命令中追加 `--target i686`（及 `--target x86_64`）即可放量。

### 2.2 构建命令

```powershell
pnpm android:build:split
```

等价于：

```powershell
pnpm tauri android build --apk --split-per-abi --target aarch64 --target armv7
```

参数说明：

- `--apk`：只产出 APK；
- `--split-per-abi`：按 ABI 分包（Gradle 逐个执行 `assembleArm64Release` / `assembleArmRelease`）；
- `--target aarch64 --target armv7`：只编译 ARM 64 位 + 32 位，x86/x86_64 不参与编译与打包。

### 2.3 产物路径

```text
src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk
src-tauri/gen/android/app/build/outputs/apk/arm/release/app-arm-release.apk
```

- debug 构建时 `release` 目录换成 `debug`；
- 已配置签名时文件名为 `app-<flavor>-release.apk`，未签名/未配签名时为 `app-<flavor>-release-unsigned.apk`。

## 3. 构建配置：PC 与移动端分离

- PC 构建沿用 `src-tauri/tauri.conf.json`（前端指向 `apps/pc`，`beforeBuildCommand` 构建 PC 前端）。
- 移动端（Android）构建由 Tauri 自动合并 `src-tauri/tauri.android.conf.json`（JSON Merge Patch RFC 7396），覆盖为移动端前端：

```json
{
  "build": {
    "frontendDist": "../apps/mobile/dist",
    "devUrl": "http://localhost:5713",
    "beforeDevCommand": "pnpm --filter @workspace/app-mobile dev",
    "beforeBuildCommand": "pnpm --filter @workspace/app-mobile build"
  },
  "app": {
    "security": {
      "capabilities": ["mobile-default"]
    }
  }
}
```

- 能力集：移动端使用 `src-tauri/capabilities/mobile-default.json`（含 notification / dialog / opener 等移动端实际用到的权限）；PC 端仍用 `window-default` + `pc-autostart`。
- 因此 PC 与移动端互不干扰，`tauri android build` 不再误打包 PC 前端。

## 4. 实现原理

- `src-tauri/gen/android/` 由 Tauri CLI 生成，其中 `buildSrc/.../RustPlugin.kt` 会按 `productFlavor`（`universal / arm64 / arm / x86 / x86_64`）生成独立的 Rust 构建与 jniLibs 合并任务。
- `--split-per-abi` 会让 Tauri 调用 `gradlew assembleArm64Release assembleArmRelease`（由 `--target` 决定取哪些 flavor）。
- 每个 flavor 只会把对应 ABI 的 `libapp.so`（及 `libc++_shared.so`）symlink 到 `src/main/jniLibs/<abi>/`，因此每个 APK 只含单一架构的 `.so`。
- 不带 `--split-per-abi` 时走 `assembleUniversalRelease`，即现在的 universal 包。

## 5. 原生工程注意事项

- `src-tauri/gen/android/` 已被 `.gitignore` 忽略（**不入库**）。重新执行 `tauri android init`、或换机器重新拉代码后需要重新生成工程。
- **关键前提**：`src-tauri/gen/android/app/build.gradle.kts` 的 `defaultConfig` **不要写死 `ndk.abiFilters`**。否则 AGP 会把 defaultConfig 与 product flavor 的 `abiFilters` 合并（取并集），导致 `arm` 包混入 `arm64-v8a` 的 `.so`，破坏分包效果。该文件内已留有说明注释，`tauri android init` 重新生成后需按注释重新核对。

## 6. 版本号（可选）

若未来在应用市场按 ABI 上传多个 APK，需要为不同 ABI 分配互不冲突的 `versionCode`（如 `abiCodes * 1000 + versionCode` 方案）。当前侧载 / 内部分发场景不需要。

## 7. 常见问题

**Q1：为什么不用 AAB 处理分包？**
AAB 上传应用市场后由市场端自动按设备下发，无需手动分包；本次按需求明确不处理 AAB。

**Q2：x86 包什么时候需要？**
需要支持 x86 模拟器或少量 x86 平板/旧设备时，把构建命令追加 `--target i686`（及 `--target x86_64`）即可，`RustPlugin.kt` 已内置对应 flavor，无需改动 Gradle 工程。

**Q3：为什么手动删掉了 defaultConfig 的 `abiFilters`？**
旧的 `abiFilters += "arm64-v8a"` 是「只打单 ABI」的临时方案。在分包场景下它与 product flavor 的 `abiFilters` 取并集，会让 32 位 arm 包错误地带上 64 位 `.so`，故移除，由 Tauri CLI 的 `--split-per-abi --target` 统一控制。
