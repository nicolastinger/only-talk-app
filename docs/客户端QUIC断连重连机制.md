# 客户端 QUIC 断连重连机制

本文档说明客户端（Tauri 桌面端）与中央服务器 QUIC 连接的建立、心跳、断连判定、断连反馈与自动重连逻辑。所有实现集中在 `src-tauri/src/quic_service/`。

## 1. 连接生命周期概览

```
登录 (user_login)
  └─ run_client(server_addr)          // 主循环，带状态机 + 自动重连
       ├─ Connecting → Connected      // 连接成功，发 quic_connected
       ├─ 保持连接（心跳 + 断连检测）
       ├─ Disconnected                // 断连，广播 quic_disconnected
       └─ 5s 后重试
```

连接状态机（`src-tauri/src/quic_service/connection_state.rs`）：
`Idle → Connecting → Connected → Disconnected`

| 状态 | 含义 |
|---|---|
| `Idle` | 手动断开，停止重连循环 |
| `Connecting` | 正在尝试连接 |
| `Connected` | 已连接，正常通信 |
| `Disconnected` | 连接断开，等待重试 |

全局状态：`GLOBAL_QUIC_STATE`（`Arc<RwLock<QuicConnectionState>>`）。

## 2. 连接建立

入口 `run_client`（`text_quic_client.rs:29`）与单次连接 `try_connect_once`（`text_quic_client.rs:133`）：

1. `Endpoint::client("0.0.0.0:0")` 创建 QUIC 客户端端点。
2. `endpoint.connect(server_addr, "onlytalk.cn")` 建立连接（SNI 为 `onlytalk.cn`）。
3. 打开一条**双向流**用于初始化与接收，优先级 0。
4. 通过双向流发送 JSON `FirstQuicMsg`（含 uuid / token），完成鉴权注册。
5. 注册 `QuicConnection` 到 `GLOBAL_QUIC_SERVER_LIST["SERVER_TEXT"]`，`is_online = true`。
6. 启动多个后台任务（见下）。

### 后台任务（`try_connect_once` 内 spawn）

| 任务 | 职责 | 位置 |
|---|---|---|
| bidi recv 循环 | 读取服务端下发的数据；**断连主检测入口** | `text_quic_client.rs:152` |
| uni 流接收循环 | 接收服务端单向流（消息推送、PONG 等） | `text_quic_client.rs:194` |
| bidi send-half 保活 | 保持发送流存活直到断连 | `text_quic_client.rs:243` |
| 心跳任务 | 周期发送 PING，检测断连 | `text_quic_client.rs:255` |

## 3. 心跳机制（应用层）

心跳由 `send_ping_msg`（`text_quic_client.rs:308`）实现：

- **间隔**：每 **10 秒**发送一次 `MSG_TYPE_PING`（payload = `"ping"`）到 uni 流。
- **回复**：服务端收到 PING 后回 `MSG_TYPE_PING`（payload = `"pong"`），客户端在 `process_ping_msg`（`process_text_msg_from_server.rs:556`）处理。
- **身份防串扰**：每次心跳任务生成唯一 `ping_uuid` 存入 `GLOBAL_QUIC_USER_INFO`；重连后旧任务检测到 `ping_uuid` 变更即自行退出（`text_quic_client.rs:344`）。
- **状态校验**：每次发送前检查 `GLOBAL_QUIC_STATE == Connected`，否则退出（`text_quic_client.rs:354`）。

## 4. 断连判定（触发条件汇总）

所有检测路径通过共享信号通道 `disconnect_tx`（`watch::channel<bool>`）通知主循环；主循环在 `run_client` 的 `rx.changed().await` 等待信号（`text_quic_client.rs:79`），收到后 `drop(endpoint)` → 置 `Disconnected`。

| 编号 | 触发路径 | 条件 | 位置 | 感知时长 |
|---|---|---|---|---|
| 1 | bidi recv 流 | `read()` 返回 `Ok(None)`（流关闭/EOF）或 `Err`（连接重置/idle 超时） | `text_quic_client.rs:175,180` | 立即 |
| 2 | 应用层心跳发送失败 | 每 10s 发送失败，`ping_lost_count` 连续 **>3** 次 | `text_quic_client.rs:381` | ~40s |
| 3 | **PONG 超时（新增）** | 距上次收到服务端 PONG 超过 **50 秒** | `text_quic_client.rs:360` | ~50s |
| 4 | 初始心跳失败 | 建连后首次 PING 发送失败 | `text_quic_client.rs:331` | 立即 |
| 5 | quinn 传输层 idle timeout（兜底） | **60 秒**无任何报文交换，连接被 quinn 关闭，之后 bidi 读报错走路径 1 | `safe_configuration.rs:63` | ~60s |
| 6 | 手动断开 | `disconnect_quic()` 置 `Idle` | `user_service.rs:362` | 立即 |

### 各场景实际断连感知时长

| 场景 | 触发路径 | 感知时长 |
|---|---|---|
| 服务端主动关闭 / 进程崩溃 | 1 | 立即 |
| 静默断连（拔网线、切网络） | 3 或 5 | ~50~60s |
| 单向丢包 / 服务端应用卡死 | 3 | ~50s |
| 网络拥塞致发送失败 | 2 | ~40s |
| 手动断开 | 6 | 立即 |

### 关键说明

- **路径 3（PONG 超时）是核心兜底**：静默断连时，`open_uni/write_all/finish` 为本地缓冲操作、不等待 ACK，发送仍"成功"，路径 2 的 `ping_lost_count` 不会自增；此时靠路径 3（PONG 超时）或路径 5（idle timeout）兜底。
- **PONG 计时起点**：在初始心跳发送成功后立即记录 `last_pong_time`（`text_quic_client.rs:333`），无需等待首个 PONG 返回；收到 PONG 时刷新（`process_ping_msg`）。
- **PONG 超时阈值**：`PONG_TIMEOUT_MS = 50_000`（`text_quic_client.rs:26`），即 5 个 10s 心跳周期未收到 PONG 即判定异常。
- **复位**：重连清理块（`run_client`）与 `disconnect_quic` 均将 `last_pong_time` 复位为 `0`，避免旧值污染新连接。

## 5. 传输层配置（quinn）

`configure_client`（`safe_configuration.rs:13`）：

| 参数 | 值 | 说明 |
|---|---|---|
| `max_idle_timeout` | **60 秒** | 无报文交换的断连兜底（原 190s 缩短为 60s） |
| `keep_alive_interval` | 5 秒 | 周期性 transport 级 PING 维持链路 |
| `max_concurrent_uni_streams` | 32 | 并发单向流上限 |

## 6. 断连反馈（前端）

### Rust → JS 事件

| 事件 | 触发时机 | 位置 |
|---|---|---|
| `quic_connected` | 连接成功 | `text_quic_client.rs:61` |
| `quic_disconnected` | 断连；**断连状态下每 3 秒持续广播**直到恢复 | `text_quic_client.rs:120` |
| `quic_sync_start` | 开始同步离线消息 | `text_quic_client.rs:67` |
| `quic_sync_complete` | 离线消息同步完成 | `text_quic_client.rs:72` |

### 前端处理

- **Hook**：`useQuicDisconnect`（`apps/pc/src/hooks/useQuicDisconnect.ts`）监听上述事件，维护 `isConnected` / `connectionState`。
- **Topbar 警告条**（`apps/pc/src/layouts/HomeLayout/index.tsx:183`）：`!isConnected` 时显示 "连接已断开" + 重连按钮。由于 Rust 端断连状态下持续广播 `quic_disconnected`，警告条会**一直显示**，直到 `quic_connected` 到来才消失。
- **同步遮罩**：`SyncLoadingOverlay` 绑定 store 的 `isSyncing`，`quic_sync_start` 打开、`quic_sync_complete` 关闭；另有 3 分钟兜底超时（`useQuicDisconnect.ts:13`）。
- **重连命令**：`reconnect_quic_command`（`user_controller.rs:46`）→ `reconnect_quic`（`user_service.rs:391`）：先 `disconnect_quic`（置 `Idle` 停止旧循环），再置 `Disconnected` 并 `spawn` 新的 `run_client`。

## 7. 重连流程

`run_client` 主循环在断连后：

1. 清理 `GLOBAL_QUIC_SERVER_LIST`，复位 `ping_lost_count` / `last_pong_time`。
2. 置状态 `Disconnected`。
3. 后台广播 `quic_disconnected`（每 3s，直到状态变化）。
4. 等待 **5 秒**（`RECONNECT_DELAY_SECS`）后重试连接。
5. 连接成功 → `Connected` → 发 `quic_connected` → 后台拉取离线消息（发 `quic_sync_start` / `quic_sync_complete`）。

## 8. 手动断开 / 重连命令

| 命令 | 处理函数 | 行为 |
|---|---|---|
| `disconnect_quic_command` | `disconnect_quic`（`user_service.rs:362`） | 置 `Idle` 停循环，清连接列表，标记 `quic_disconnected=true`，轮换 `ping_uuid` |
| `reconnect_quic_command` | `reconnect_quic`（`user_service.rs:391`） | 先断开，再置 `Disconnected` 并启动新 `run_client` |
| `get_quic_connection_state` | 返回当前状态字符串 | `idle` / `connecting` / `connected` / `disconnected` |

## 9. 关键常量汇总

| 常量 | 值 | 位置 |
|---|---|---|
| `RECONNECT_DELAY_SECS` | 5s | `text_quic_client.rs:24` |
| `DISCONNECT_BROADCAST_SECS` | 3s | `text_quic_client.rs:26` |
| `PONG_TIMEOUT_MS` | 50_000 (50s) | `text_quic_client.rs:27` |
| 心跳间隔 | 10s | `text_quic_client.rs:342` |
| 心跳发送失败阈值 | >3 次 | `text_quic_client.rs:381` |
| quinn idle timeout | 60s | `safe_configuration.rs:63` |
| quinn keep_alive | 5s | `safe_configuration.rs:66` |
| 同步遮罩兜底 | 3 分钟 | `useQuicDisconnect.ts:13` |
