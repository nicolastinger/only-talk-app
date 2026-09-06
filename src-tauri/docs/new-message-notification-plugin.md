# 新消息系统通知(tauri-plugin-notification)接入说明

> 本文档面向**后续接手的人**,重点说明一个最容易踩的坑:
> **通知插件含 Android 原生模块,`src-tauri/gen/android` 是 git 忽略的本地生成产物,换机器/重新拉代码后必须先跑一次安卓构建把插件模块生成出来**,否则手机端既弹不了通知、也收不到"点击跳会话"事件。

## 1. 功能与触发规则

收到新**聊天消息**(单聊文本/图片/文件、群聊文本/图片/文件)时提醒,规则如下:

| 场景 | 行为 |
| --- | --- |
| 消息属于**当前正在查看的会话** | 不提醒(走原有未读/清未读逻辑) |
| **前台**且消息来自其它会话 | 桌面端:主窗口右上角弹**可点击横幅**,点击跳到对应会话;移动端:不弹 |
| **后台/失焦/托盘隐藏**(`app_foreground=0`) | 发**系统通知**(OS toast),标题=好友名/群名,正文=消息预览(`[图片]`/`[文件]`/文本),同一会话 4s 去抖 |
| 自己其它端发来的消息 | 不提醒 |

移动端点系统通知 → 插件回传 `actionId="tap"` + 会话目标(`extra.payload.chat`)→ 前端 `router.push` 跳到对应单聊/群聊窗口。

## 2. 安卓后台保活(前台服务)行为说明

为了让 App 退到后台时仍能收到 QUIC 消息并弹系统通知,安卓端用一个**前台服务**(`KeepAliveService`)保活进程。行为要点:

- **只在后台运行、前台不打扰**:`MainActivity.onPause`(退后台)启动前台服务,`onResume`(回前台)后**延迟约 1.5s 再停止**(确保服务已完成 `startForeground`,避免竞态崩溃)。回到前台后通知栏自动恢复干净。
- **防崩溃与去抖**:用 `KeepAliveService.isRunning` 标志去重;快速 前台↔后台 切换(点通知栏、下拉通知、权限弹窗等)不会反复 stop/start,只在回到前台连续停留后才真正停止。
  - ⚠️ 不要退回"onPause 启动 + onResume 立刻停止"的写法:会在 `startForeground` 完成前被 stop,触发 `ForegroundServiceDidNotStartInTimeException` ANR(已在模拟机复现)。
- **通知可见性**:Android 强制要求前台服务运行期间必须带一条通知,**无法彻底隐藏、且为 ongoing(用户划不走)**。已尽量低调:
  - 只有 App 在后台时才出现(前台无此通知);
  - 通知通道 `IMPORTANCE_MIN`,静音、不震动、无角标。
  - 若连后台这条也不想出现,只能放弃前台服务,那样后台保活会不可靠。
- **省电与保活锁**:服务运行期间(即 App 退到后台期间)**持续持有** `WakeLock` + WiFi 高功耗锁(`WIFI_MODE_FULL_HIGH_PERF`),保证 CPU 不休眠、Wi-Fi 不降功耗,后台 QUIC 心跳与 PONG 才能续上;回到前台(服务停止)后两锁释放。
- **电池优化豁免**:前台服务只能阻止进程进入 cached 态,**没法阻止 Doze/App Standby/国产 ROM 电池优化**限制后台执行与网络(这也是「保活通知在、整个进程仍被冻结」的原因)。`MainActivity` 首次启动会通过 `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 引导用户把 App 设为电池优化豁免(已在 manifest 声明 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`)。
- 用户从最近任务划掉 App 时,由 manifest 的 `android:stopWithTask="true"` 自动停止服务。

## 3. 为什么必须"生成安卓模块"

- 通知能力分两层:
  - 桌面端/服务端逻辑:纯 Rust,打包即可用(`notify-rust`)。
  - **安卓端**:依赖 `tauri-plugin-notification` 自带的 Kotlin 代码(`app.tauri.notification.*`,负责真正弹通知、把点击事件回传给前端)。
- 安卓端插件代码**不是**直接 commit 的源码,而是 Tauri CLI 在 `tauri android dev/build` 时,根据 `src-tauri/Cargo.toml` 里的依赖自动同步生成到 `src-tauri/gen/android/` 下(`gen/android/.../tauri-plugin-notification/` 等插件模块)。
- `src-tauri/gen/` 在 `.gitignore` 中(`git check-ignore -v src-tauri/gen/` 可确认),**没有入库**。
  - 因此:新机器 clone 后、或有人手动删过 `gen/android`、或 `tauri android init` 重建过工程时,**必须重新生成**。
  - `MainActivity.kt`、本通知的保活服务等自定义安卓代码同样在 `gen/android` 内、同样是本地产物,重跑 `tauri android init` 会被覆盖——如果需要长期保留,请把这些改动纳入版本控制或用模板维护。

### 关键命令(在仓库根目录,即 `only-talk-app/` 下执行)

```bash
# 生成/同步安卓模块 + 起安卓真机调试(最常用)
pnpm tauri android dev

# 或仅打包 APK/AAB(同样会同步安卓模块)
pnpm tauri android build
```

> 依赖侧只要保留住 `src-tauri/Cargo.toml` 里的 `tauri-plugin-notification = "2"` 以及
> `apps/pc`、`apps/mobile` 的 `@tauri-apps/plugin-notification` 依赖,CLI 就会在下次安卓构建时自动补出该插件模块;反之若把依赖删了,安卓端会静默退回"无通知"。

## 4. 本次改动涉及的文件

Rust(仓库内、已入库):
- `src-tauri/Cargo.toml` — 新增依赖 `tauri-plugin-notification = "2"`
- `src-tauri/src/lib.rs` — desktop/mobile 两个 Builder 都注册 `.plugin(tauri_plugin_notification::init())`
- `src-tauri/src/service/message_alert.rs` — **新增**:提醒判定 + 发系统通知/横幅事件(含 4s 去抖、标题/正文构造)
- `src-tauri/src/service/mod.rs` — 注册 `message_alert`
- `src-tauri/src/quic_service/center_service/process_text_msg_from_server.rs` — 单聊/群聊收消息处调用 `message_alert::on_incoming_message(...)`
- `src-tauri/capabilities/window-default.json` — 新增 `notification:default`(移动端 JS 收点击事件需要)

前端(仓库内、已入库):
- `apps/pc/src/components/MessageAlertBanner/index.tsx` — **新增**:桌面可点击横幅 + `app_foreground` 前台状态维护
- `apps/pc/src/layouts/HomeLayout/index.tsx` — 挂载横幅;托盘隐藏时写 `app_foreground=0`
- `apps/mobile/src/App.vue` — 前台状态维护 + 插件 `onAction` 监听,点击通知跳到 `/chats/chat/:friendId` 或 `/chats/group-chat/:groupId`

安卓原生(在 `gen/android` 内,**本地生成、未入库**,重生成后会保留在工程里):
- `KeepAliveService.kt` — 后台保活前台服务:服务运行期间**恒持 WakeLock + WiFi 高功耗锁**(防 CPU 休眠/Wi-Fi 省电断 QUIC);通知通道 `IMPORTANCE_MIN`(静音),暴露 `isRunning` 供 Activity 去重启停
- `MainActivity.kt` — 仅在退后台(`onPause`)时启动保活、回前台(`onResume`)延迟 1.5s 停止;Android 13+ 申请 `POST_NOTIFICATIONS`、引导申请电池优化豁免(防 Doze/OEM 冻结进程)
- `AndroidManifest.xml` — 声明保活服务(`foregroundServiceType="dataSync"`、`stopWithTask="true"`)、所需权限及 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
- `strings.xml` — 保活通知文案

## 5. 复现/验证步骤

1. 确保依赖齐全:`pnpm install`(workspace 根)。
2. 重新生成安卓模块 + 装到手机:
   ```bash
   pnpm tauri android dev
   ```
3. 验证:
   - App 切后台后,另一账号给当前账号发消息 → 状态栏出现系统通知,标题为好友/群名。
   - 点击该通知 → App 回到前台并直接打开对应会话;期间反复点通知/切前后台不应崩溃(`ForegroundServiceDidNotStartInTimeException`)。
   - 退后台后通知栏出现一条**静音保活通知**,回到前台约 1.5s 后自动消失。
   - 桌面端:前台时在其它会话/页面收到消息 → 右上角横幅,点击跳到对应会话;最小化/托盘隐藏后收到消息 → 系统通知。
   - 手机设置里允许通知权限(Android 13+ 首次启动会请求 `POST_NOTIFICATIONS`)。

## 6. 已知限制与后续可做

- **桌面端系统通知没有"点击回调"**(`tauri-plugin-notification` 桌面实现不支持),桌面跳转依赖应用内横幅;这是之前确认过的取舍。
- **移动端冷启动点通知可能丢失**:若 App 进程已被系统彻底杀掉,点通知冷启动时插件点击事件可能早于前端监听注册而丢。常规"切后台"场景因前台服务保活进程存活,不受影响。如需要,可在 `MainActivity` 把点击 intent 落盘、启动后读取补齐。
- 目前只对聊天消息(文本/图片/文件)提醒;好友请求等系统通知暂未纳入(可复用 `message_alert` 的思路扩展)。
- 若后续不再需要后台常驻通知,删除 `Cargo.toml` 依赖与 `lib.rs` 注册、`capabilities` 权限、前端 `onAction`/横幅即可,不影响其它功能。
