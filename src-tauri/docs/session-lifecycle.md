# 会话生命周期状态机(登录/登出资源管理)

> 本文说明客户端 **登录 ⇄ 登出** 的完整生命周期如何被收口为**单一会话 actor(状态机)**，
> 以及各资源(数据库 / QUIC / 后台定时任务 / 媒体)在状态迁移时的 **acquire / release** 规则。
> 面向后续接手者：改登录初始化或登出清理时，请在这些状态迁移函数里改，而不是在命令里散落清理。

## 1. 为什么做成状态机

历史上登录/登出清理分散在若干命令里：`logout` 只清 map/池、QUIC 连接循环没停、后台定时任务靠 `schedule_key` 自然退出、移动端强制下线甚至不调 Rust 清理。结果表现为：

- 登出后 QUIC 仍每隔几秒用已清空的 token 重连空转；
- 已读上报 / 未发消息重发等长循环登出后仍短暂运行、可能跨会话执行；
- 登录与登出可并发执行(理论竞态)；
- 资源清理顺序脆弱(如停 QUIC 需要用户信息与 user 库仍在)。

现在统一为 **单会话 actor + 显式状态机**，命令只负责发指令，资源迁移全部在状态迁移函数中串行完成。

## 2. 状态定义

`src-tauri/src/service/session_manager.rs`：

| 状态 | 含义 | 说明 |
| --- | --- | --- |
| `LoggedOut` | 未登录/已登出 | 初始态；无任何会话资源 |
| `LoggingIn` | 正在登录 | acquire 阶段：拉私库密钥 → 建库 → 拉好友/群/未读 → 启 QUIC 与后台任务 |
| `LoggedIn` | 已登录 | 资源齐全、会话运行中(QUIC 内部断线重连不改变本状态) |
| `LoggingOut` | 正在登出 | release 阶段：停 QUIC → 取消后台任务 → 取消媒体 → 关库 → 清全局 |

正常迁移路径：`LoggedOut → LoggingIn → LoggedIn → LoggingOut → LoggedOut`。
登录失败自动回退 `LoggedOut`，可直接重试。

## 3. Actor 设计

- 单例 `SESSION_MANAGER`(`std::sync::LazyLock`)。
- 内部 `mpsc::unbounded_channel` + 单个 worker 任务：所有 `Login/Logout` 指令**串行**消费，进程内只有一个 worker(懒启动)。
- 指令带 `oneshot` 回执，调用方 `await` 到迁移真正完成才返回(与旧的同步 `user_login()` 语义一致)。
- `SessionPhase` 存于 `tokio::sync::RwLock`，可随时 `phase()` 读取。

这样登录中/登出中再次发同类指令会拿到明确错误(`当前已登录/会话忙/正在登出`)，而不是并发执行互相踩。

## 4. 登录迁移(LoggedOut → LoggedIn)

入口：`user_login()` → `SESSION_MANAGER.login()` → worker 执行 `perform_session_login_tasks()`(`user_service.rs`)。步骤：

1. 从服务端拉取本设备私库密钥(`/user/sqlite_key/fetch`)，仅存内存；
2. `init_sqlite()` 初始化明文 user 库、`init_private_db()` 初始化加密 private 库(SQLCipher，含遗留明文聊天表清理)；
3. 拉好友列表、群列表、单聊/群聊未读、未读通知(失败各自记录日志不阻塞)；
4. 启动 QUIC 客户端连接循环(单代管理，`epoch` + cancel)；
5. 注册会话级后台任务 supervisor(见 §6)到 `SESSION_CONTROL`。

> 登录所需的 token/uuid 由 `sign_in`/`quick_login` 先写入全局再调用 `user_login()`，此处只做会话资源装载。

## 5. 登出迁移(LoggedIn → LoggedOut)

入口：`teardown_session()` → `SESSION_MANAGER.logout()` → worker 执行 `perform_session_logout_tasks()`。步骤(顺序有讲究)：

1. **停 QUIC**：仅在仍有连接/非 Idle 时调用 `disconnect_quic()`——它需要在用户信息与 user 库仍在时执行(内部写离线标记并落事件日志)；先停 QUIC，避免登出后空转重连；
2. **取消会话级后台任务**：`SESSION_CONTROL` cancel + `await`(最多 15s 兜底)；
3. **取消在途媒体/视频通话**：`MEDIA_DATA_CANCEL_TOKEN`；
4. `GLOBAL_QUIC_STATE` 复位 Idle；
5. 清 `GLOBAL_QUIC_USER_INFO` 与 `GLOBAL_QUIC_SERVER_LIST`；
6. 关闭明文/加密用户库连接池(`GLOBAL_SQL_POOL` / `GLOBAL_PRIVATE_SQL_POOL`)；
   **保留 `GLOBAL_COMMON_SQL_POOL`**(免登录用户列表 `get_quick_login_users` 需要)。

幂等性：`LoggedOut` 状态下再 `logout()` 直接成功，因此 PC 端「logout + clear_user_info」双调用、移动端重复触发都无副作用。

## 6. 会话级后台任务 supervisor

`start_session_tasks(cancel)`(`user_service.rs`)替代旧 `start_read_task`：

- 10s 预热后写入 `schedule_key`；
- 将「单聊已读上报」「通知已读上报」两个长循环放进 `tokio::task::JoinSet`；
- 主循环每秒 `select!`：`cancel.cancelled()` 触发时 `abort_all()` + `join_all` 后返回(彻底退出)，否则每 10s 派发一次「未发送消息重发」子任务；
- 保留 `schedule_key` 校验作为会话被替换时的自愈兜底。

## 7. 前端接入(移动端)

`apps/mobile/src/App.vue` 用 `watch(isLoggedIn)` 驱动：

- **登出 / 被踢下线**(`force_logout` 确认、设置页退出)→ `clearAuth()` 置 false → watch 自动 `invoke('logout')`(Rust 全量清理)+ `stopUnreadMonitor()` / `stopQuicMonitor()` / `clearUuidCache()`；
- **重新登录** → watch 自动重启两个 monitor(内部有防重入守卫)。

PC 端沿用 `invoke('logout')` + `invoke('clear_user_info')`(幂等)。因此任何新的"登出入口"只要让 auth 状态置为未登录即可，清理逻辑在 Rust 端收敛，无需逐处写。

## 8. 新增/修改建议

- 新增会话级资源(定时器、长连接、token 等)：在 `perform_session_login_tasks` acquire，在 `perform_session_logout_tasks` release，并把句柄/令牌放入 `SESSION_CONTROL` 之类可取消载体；
- 需要会话忙状态时用 `SESSION_MANAGER.phase()` 读取；
- 不要绕过 actor 在命令里直接 `clear map / take pool`，会破坏串行与幂等语义。

## 9. 日志约定

状态机与资源迁移的所有关键步骤都带统一前缀，便于 grep 与按阶段定位问题：

| 前缀 | 含义 |
| --- | --- |
| `[session]` | actor 状态迁移(收到指令、LoggedOut/LoggingIn/LoggedIn/LoggingOut 迁移与结果) |
| `[session][login]` | 登录任务逐步日志(1/6 拉私库密钥 → 2/6 user 库 → 3/6 private 库 → 4/6 好友/群/未读 → 5/6 QUIC → 6/6 后台任务) |
| `[session][logout]` | 登出任务逐步日志(1/6 停 QUIC → 2/6 停后台任务 → 3/6 取消媒体 → 4/6 状态复位 → 5/6 清 map/连接 → 6/6 关库) |
| `[session][task]` | 会话级后台任务(supervisor 启停、schedule_key 自愈退出、子任务取消) |

每步都会打印「开始 / 完成 / 跳过」；失败用 `error`/`warn` 并尽量继续后续清理(登出不因单步失败中断)。

## 10. 相关文件

| 文件 | 内容 |
| --- | --- |
| `src/service/session_manager.rs` | 状态机 + actor(状态、迁移、worker) |
| `src/service/user_service.rs` | `perform_session_login_tasks` / `perform_session_logout_tasks` / supervisor / `user_login` / `teardown_session` 薄入口 |
| `src/lib.rs` | `SESSION_CONTROL`、`MEDIA_DATA_CANCEL_TOKEN`、各全局池定义 |
| `src/cmd/auth_controller.rs` | `logout` / `clear_user_info` 命令入口 |
| `apps/mobile/src/App.vue` | 登录态 watch 驱动 Rust 清理与 monitor 启停 |
