# Android 签名与证书说明（密钥与密码均不入库）

> release APK 必须签名才能安装/覆盖升级；**签名密钥与密码绝不进入 Git 仓库**。
> 构建时 Gradle **只从本机固定目录** `%USERPROFILE%\.only-talk\android\`
> （macOS/Linux `~/.only-talk/android/`）读取配置，**不读取任何环境变量**。

## 1. 约定

- 密钥与配置**只放在本机固定目录** `~/.only-talk/android/`：不放仓库、不走环境变量。
- 仓库只保存构建逻辑（`app/build.gradle.kts`），不保存任何密钥或密码。
- 配置缺失时 release 产出**未签名** APK 并打警告，不会让 `debug`/普通构建失败。

## 2. 目录与文件

| 文件 | 说明 |
| --- | --- |
| `~/.only-talk/android/upload-keystore.jks` | 签名密钥库（含私钥 + 自签名证书） |
| `~/.only-talk/android/keystore.properties` | 签名配置（密钥路径 + 密码 + 别名） |

Windows 即 `%USERPROFILE%\.only-talk\android\`，例如 `C:\Users\nico\.only-talk\android\`。

`keystore.properties` 格式：

```properties
# storeFile 可写相对该目录的路径, 也可写绝对路径
storeFile=upload-keystore.jks
storePassword=<库密码>
keyAlias=upload
keyPassword=<key 密码>
```

`app/build.gradle.kts` 读取该文件；当密钥文件不存在、或 `storePassword`/`keyPassword` 为空时，
自动走未签名分支（构建日志打印 `[signing] 未检测到 Android 签名配置...` 告警）。

## 3. 证书属性（本机现用）

自签名证书（无 CA 颁发），唯一作用是**证明「同一 App 的连续版本由同一主体发布」**，从而支持覆盖
安装与升级；DN 无真实身份含义。

| 项 | 值 |
| --- | --- |
| 拥有者 Subject | `CN=only-talk, OU=dev, O=only-talk, L=Hangzhou, ST=Zhejiang, C=CN` |
| 颁发者 Issuer | 同上（自签名） |
| 密钥库别名 Alias | `upload` |
| 条目类型 | `PrivateKeyEntry` |
| 有效期 | `2026-09-04 07:11:59 CST` 起，`2054-01-20 07:11:59 CST` 止（约 27 年 / 10000 天） |
| 序列号 | `d373629c4873f42` |
| 公钥算法 | 2048 位 RSA |
| 签名算法 | SHA384withRSA |
| 证书版本 | X.509 v3 |
| SHA-1 指纹 | `D0:E0:19:F8:78:05:ED:A4:DF:8C:D6:2E:FA:28:30:4E:02:E8:90:E6` |
| SHA-256 指纹 | `1F:72:C5:9D:33:4B:A6:7D:C0:43:4E:68:DA:48:F2:D1:F3:E6:E0:F5:6D:29:C7:69:2F:3E:2A:52:65:94:75:AE` |

> 指纹是公开信息，可核对某个 APK 是否由本证书签发；真正的机密只有库密码 / key 密码
> （在 `keystore.properties` 中，且不入库）。

## 4. 用 keytool 生成密钥（教学）

### 4.1 keytool 从哪来

keytool 随 JDK 提供，通常位于 `%JAVA_HOME%\bin\keytool.exe`（本机可用 Android Studio 自带 JBR）：

```powershell
# 能打印帮助即正常
& "$env:JAVA_HOME\bin\keytool.exe" -help
```

### 4.2 生成命令

```powershell
$dir = "$env:USERPROFILE\.only-talk\android"
New-Item -ItemType Directory -Path $dir -Force | Out-Null

& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore "$dir\upload-keystore.jks" `
  -alias upload `
  -keyalg RSA -keysize 2048 -validity 36500
```

参数说明：

| 参数 | 含义 |
| --- | --- |
| `-genkeypair` | 生成密钥对（私钥 + 自签名证书） |
| `-v` | 输出详细信息 |
| `-keystore <路径>` | 密钥库文件；不存在则新建 |
| `-alias <别名>` | 密钥条目标识，本项目固定用 `upload`（须与 `keystore.properties` 的 `keyAlias` 一致） |
| `-keyalg RSA` | 密钥算法 |
| `-keysize 2048` | 密钥长度（位） |
| `-validity 36500` | 有效期（天），36500 ≈ 100 年 |
| `-storetype` | 密钥库类型，默认 JKS；JDK 9+ 可写 `pkcs12`（更通用） |
| `-dname "..."` | 非交互式指定证书主题（见 4.3） |
| `-storepass` / `-keypass` | 非交互式指定密码（⚠️ 会留在命令历史，慎用） |

> 文件名里的 `.jks` 只是习惯，内容格式由 `-storetype` 决定；JKS 与 PKCS12 两种 Gradle 均可读取。

### 4.3 交互式会问什么

直接跑 4.2 的命令，keytool 会依次提示：

1. `Enter keystore password:` 输入**库密码**，`Re-enter new password:` 再输一次；
2. 依次回答证书主题：`first and last name?`（CN，可填 `only-talk`）→ `organizational unit?`（OU）
   → `organization?`（O）→ `city?`（L）→ `state?`（ST）→ `two-letter country code?`（C，如 `CN`）；
3. `Is CN=..., OU=... correct? [no]:` 输入 `y` 确认；
4. `Enter key password for <upload>:` 输入 **key 密码**（直接回车 = 与库密码相同）。

非交互式等价写法（适合脚本；密码会进历史）：

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore "$dir\upload-keystore.jks" `
  -alias upload -keyalg RSA -keysize 2048 -validity 36500 `
  -dname "CN=only-talk, OU=dev, O=only-talk, L=Hangzhou, ST=Zhejiang, C=CN" `
  -storepass "<库密码>" -keypass "<key 密码>"
```

### 4.4 生成后：复制到哪里

无论用哪种方式生成，最终**两个文件都必须放到本机固定目录**：

| 文件 | 复制到哪里（目标位置） |
| --- | --- |
| `upload-keystore.jks` | `%USERPROFILE%\.only-talk\android\upload-keystore.jks` |
| `keystore.properties` | `%USERPROFILE%\.only-talk\android\keystore.properties` |

若已在别处（如 Android Studio 的 *Generate Signed Bundle/APK* 向导）生成好 `.jks`，**只复制、不要重新生成**（重新生成会更换签名主体）：

```powershell
$dir = "$env:USERPROFILE\.only-talk\android"
New-Item -ItemType Directory -Path $dir -Force | Out-Null

# 把 <来源路径> 换成实际生成位置, 目标固定为 $dir
Copy-Item "<来源路径>\upload-keystore.jks" "$dir\upload-keystore.jks" -Force
```

再按 §2 格式写入密码配置：

```powershell
@"
storeFile=upload-keystore.jks
storePassword=<库密码>
keyAlias=upload
keyPassword=<key 密码>
"@ | Set-Content -LiteralPath "$dir\keystore.properties" -Encoding UTF8
```

校验放置结果（应为 `True`）：

```powershell
Test-Path "$env:USERPROFILE\.only-talk\android\upload-keystore.jks"
Test-Path "$env:USERPROFILE\.only-talk\android\keystore.properties"
```

## 5. 打包

只要 §2 的两个文件就位，**直接构建即会签名**：

```powershell
# 仓库根目录
pnpm tauri android build            # universal 单包
pnpm android:build:split            # arm64 + arm 按 ABI 分包
```

产物：

```
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
src-tauri/gen/android/app/build/outputs/apk/{arm64,arm}/release/app-*-release.apk
```

## 6. 校验是否签名成功

- 已签名：产物名为 `*-release.apk`；未签名：`*-release-unsigned.apk`，且日志有
  `[signing] 未检测到 Android 签名配置...` 警告。
- 从 APK 反查签名者：`apksigner verify --print-certs <apk>`
  （`%LOCALAPPDATA%\Android\Sdk\build-tools\<版本>\apksigner.bat`），指纹应与 §3 一致。
- 查看 Gradle 实际读到的证书：`cd src-tauri/gen/android && .\gradlew.bat :app:signingReport`，
  确认 `*Release` 变体为 `Config: release` 且 `Store: ...\.only-talk\android\upload-keystore.jks`。

## 7. 查看证书

```powershell
# 从密钥库查看(会要求库密码; 勿把密码写进命令历史)
& "$env:JAVA_HOME\bin\keytool.exe" -list -v `
  -keystore "$env:USERPROFILE\.only-talk\android\upload-keystore.jks" `
  -alias upload
```

输出含 Subject / Issuer、有效期、序列号、公钥算法、SHA-1 / SHA-256 指纹等。

## 8. 保管、备份与轮换（重要）

签名证书一旦丢失，**同包名发布的 App 将无法再升级**（Android 只允许签发者相同的包覆盖安装）：

- 妥善备份 `upload-keystore.jks` **和** `keystore.properties`（密码），建议离线加密存储；
- 不要提交进 Git（仓库已忽略 `*.jks` / `*.keystore` / `keystore.properties`）；
- 不要用其他机器重新 `-genkeypair` 覆盖旧库，否则签名主体变更，历史版本无法升级；
- 上架应用市场时注意区分「上传密钥 upload key」与市场托管的「签名密钥」，本项目当前为侧载/自签。

**更换 / 轮换的后果**：换密钥后新旧版本签名不同，**同包名无法覆盖升级**，用户需卸载重装；
仅在密钥泄露 / 损坏等确有必要时更换，并接受「无法平滑升级」的代价。

## 9. 可选：转成 PKCS12

`keytool` 可能提示 JKS 为专用格式、建议迁移到 PKCS12。迁移**不影响**证书与指纹，只是换容器：

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -importkeystore `
  -srckeystore "$env:USERPROFILE\.only-talk\android\upload-keystore.jks" `
  -destkeystore "$env:USERPROFILE\.only-talk\android\upload-keystore.p12" `
  -deststoretype pkcs12
```

迁移后把 `keystore.properties` 的 `storeFile` 改成新文件名，并保留好备份。

## 10. 相关文件

| 文件 | 作用 |
| --- | --- |
| `src-tauri/gen/android/app/build.gradle.kts` | 读取本机 `keystore.properties`、配置 `signingConfigs.release`、缺配置时告警 |
| `src-tauri/gen/android/.gitignore` | 忽略 `keystore.properties` / `local.properties` 等本地文件 |
| 仓库根 `.gitignore` | 忽略 `**/*.jks`、`**/*.keystore` 及 `gen/android/keystore.properties` |
| `src-tauri/docs/self-update.md` §7.2 | 发布 SOP 中的签名步骤摘要 |
