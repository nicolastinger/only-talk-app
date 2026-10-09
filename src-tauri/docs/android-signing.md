# Android 签名密钥配置（密钥与密码均不入库）

> 目标：release APK 需要签名，但**签名密钥与其密码绝不进入 Git 仓库**。
> 密钥文件放在本机固定目录，构建时由 Gradle 指向它；密码只通过环境变量注入。

## 1. 设计原则

- `.jks` 密钥文件存放在**仓库之外**的本机目录，不随代码分发。
- 仓库只保存「默认路径规则」与构建逻辑（`app/build.gradle.kts`），不保存任何密钥或密码。
- 密码、别名一律从**环境变量**读取；CI 上通过 GitHub Secrets 注入同名变量。
- 缺失密钥时 release 产出**未签名** APK 并打警告，不会再让 `debug`/普通构建失败。

## 2. 密钥存放位置

默认路径（跨平台统一用「用户目录」推导）：

| 平台 | 实际路径 |
| --- | --- |
| Windows | `%USERPROFILE%\.only-talk\android\upload-keystore.jks` |
| macOS/Linux | `~/.only-talk/android/upload-keystore.jks` |

若想换位置，设置环境变量 `ANDROID_KEYSTORE_PATH` 指向绝对路径即可，无需改代码。

> 例：本机当前位于 `C:\Users\nico\.only-talk\android\upload-keystore.jks`。

## 3. 环境变量

`src-tauri/gen/android/app/build.gradle.kts` 在配置阶段读取以下变量：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ANDROID_KEYSTORE_PASSWORD` | 是 | 无 | keystore 库密码 |
| `ANDROID_KEY_PASSWORD` | 是 | 无 | key 密码（可与库密码相同） |
| `ANDROID_KEY_ALIAS` | 否 | `upload` | key 别名 |
| `ANDROID_KEYSTORE_PATH` | 否 | `~/.only-talk/android/upload-keystore.jks` | 密钥文件绝对路径 |

四个条件（文件存在 + 三个密码/别名字段非空）全部满足时才启用签名；否则走未签名分支。

## 4. 首次生成密钥（仅当还没有 `.jks` 时）

> ⚠️ 已有密钥请**不要**重跑下面的命令，否则会覆盖旧密钥；一旦覆盖，用旧密钥签名的历史 APK 将无法覆盖安装升级。

```powershell
# 确保目录存在
$dir = "$env:USERPROFILE\.only-talk\android"
New-Item -ItemType Directory -Path $dir -Force | Out-Null

# 生成密钥（按提示输入库密码与 key 密码；别名用 upload）
keytool -genkeypair -v `
  -keystore "$dir\upload-keystore.jks" `
  -alias upload `
  -keyalg RSA -keysize 2048 -validity 36500
```

## 5. 本地打签名 release 包

```powershell
# 1. 设置签名环境变量（仅当前会话；<...> 换成你自己的密码）
$env:ANDROID_KEY_ALIAS         = "upload"
$env:ANDROID_KEYSTORE_PASSWORD = "<库密码>"
$env:ANDROID_KEY_PASSWORD      = "<key 密码>"

# 2. 仓库根目录执行打包（会同步插件模块 + 调用 gradle assembleRelease）
pnpm tauri android build

# universal 产物：
#   src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
# 按 ABI 分包产物（可选）：
#   pnpm android:build:split
```

想永久生效可用 `setx ANDROID_KEYSTORE_PASSWORD "<库密码>"` 等（注意 `setx` 会把值明文写进用户级注册表 / 环境变量）。

## 6. CI（GitHub Actions）

Android 目前是手动打包（未接 CI）。接入后：

1. 把 `.jks` 以 Secret/base64 形式提供，或写入 runner 的 `~/.only-talk/android/`；
2. 在仓库 **Settings → Secrets and variables → Actions** 配置：
   `ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_PASSWORD`（可选 `ANDROID_KEY_ALIAS`、`ANDROID_KEYSTORE_PATH`）。

## 7. 为什么不用旧的 `keystore.properties`

旧方案在 `gen/android/keystore.properties` 里同时存放**相对路径和明文密码**，并用
`keystoreProperties["keyAlias"] as String` 直接强转：

- 一旦该文件被误提交，密钥与密码全部泄露；
- 新克隆 / 没配密钥的机器上，文件不存在时强转会**直接导致构建失败**（连 debug 都过不去）。

现方案移除了该文件：密钥出仓库、密码走环境变量、缺失时安全降级。

## 8. 相关文件

| 文件 | 作用 |
| --- | --- |
| `src-tauri/gen/android/app/build.gradle.kts` | 读取环境变量、配置 `signingConfigs.release`、缺密钥时告警 |
| `src-tauri/gen/android/.gitignore` | 忽略 `keystore.properties` / `local.properties` 等本地文件 |
| 仓库根 `.gitignore` | 忽略 `**/*.jks`、`**/*.keystore` 及 `gen/android/keystore.properties` |
| `src-tauri/docs/self-update.md` §7.2 | 发布 SOP 中的签名步骤摘要 |
