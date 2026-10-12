# WebRTC 信令与通话流程文档

> 本文描述 `only-talk-app` 中 WebRTC 视频/语音通话的**控制消息**、**信令消息**、**存储模型**与**端到端流程**，含前端(PC)与 Rust 后端(Tauri + QUIC)两侧。
> 相关代码：`apps/pc/src/services/webrtcService`、`apps/pc/src/pages/WebRTC/Chat`、`apps/pc/src/pages/Home/Chats/components`、`src-tauri/src/quic_service/center_service`、`src-tauri/src/dao/webrtc_signal_db.rs`。

## 1. 总体架构

通话被拆成**两层消息**：

| 层 | 消息类型 | 通道 | 服务器是否持久化 | 用途 |
|---|---|---|---|---|
| 控制消息 | `12 邀请 / 13 接受 / 14 拒绝 / 15 结束` | 普通单聊 QUIC（`send_text_msg`） | ✅ 持久化 | 作为聊天记录展示，驱动「允许/拒绝」与窗口开启 |
| 信令消息 | `100 offer / answer / candidate / end` | 单聊 QUIC（`send_text_msg`） | ❌ 不持久化 | 仅用于建立 `RTCPeerConnection`，只在已打开的 WebRTC 窗口内流转 |

核心原则：
- **窗口开启由「控制消息」驱动**，而不是由收到 `offer`（100）自动打开。
- **`100` 信令只发生在双方 WebRTC 窗口建立之后**，且只在窗口之间流转，不再经过任何聊天窗口。
- 每次通话生成的 `sessionId` **唯一**，用于把一次通话的摘要与明细关联起来。

## 2. 信息类型表

### 2.1 控制消息（文本类型）

| text_type | 常量 | 方向 | 落库 | 前端渲染 |
|---|---|---|---|---|
| 12 | `MSG_TYPE_P2P_VIDEO_CALL_INVITE` | 主叫 → 被叫 | `chat_record` | 被叫：`CallInviteMessage`（含允许/拒绝按钮）；主叫：`WebRTCMessage`（已发送邀请） |
| 13 | `MSG_TYPE_P2P_VIDEO_CALL_ACCEPT` | 被叫 → 主叫 | `chat_record` | `WebRTCMessage`（已接听），主叫并触发开窗 |
| 14 | `MSG_TYPE_P2P_VIDEO_CALL_REJECT` | 被叫 → 主叫 | `chat_record` | `WebRTCMessage`（已拒绝），主叫清除等待状态 |
| 15 | `MSG_TYPE_P2P_VIDEO_CALL_END` | 任一方 | `chat_record` | `WebRTCMessage`（通话结束） |

控制消息 raw 为 JSON：
```json
{ "type": "invite|accept|reject|end", "sender": "...", "receiver": "...", "sessionId": "...", "timestamp": 1234 }
```
它们走正常的单聊消息管线（落库、Emit、会话/未读），并在客户端 `MineChatBox` / `CustomerChatBox` 中由 `WebRTCMessage` 或 `CallInviteMessage` 渲染。

### 2.2 信令消息（`text_type = 100`）

见 `packages/types/src/webrtc/index.ts` 的 `WebRTCSignalMessage`：

```ts
interface WebRTCSignalMessage {
  type: "offer" | "answer" | "candidate" | "end";
  sender: string;
  receiver: string;
  sessionId: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}
```

| type | 含义 | 存储 |
|---|---|---|
| `offer` | 主叫的媒体描述（含 ICE 候选，完整 SDP 模式） | `webrtc_signal` 明细 + `chat_record` 会话摘要 |
| `answer` | 被叫的媒体描述 | `webrtc_signal` 明细 + 会话摘要更新 |
| `candidate` | ICE 候选（当前默认 `useCompleteSDP=true`，候选内嵌在 SDP，本类型为兼容路径） | 仅 `webrtc_signal` 明细 |
| `end` | 结束通话 | `webrtc_signal` 明细 + 会话摘要更新 |

> 信令消息经服务器**转发 + ACK，但不持久化**（`only-talk-rs` 的 `process_msg_service.rs` 对 `text_type=100` 跳过 `add_user_chat_record`）。因此离线不回放信令；若对端不在线，呼叫自然失败。

## 3. 存储模型

| 表 | 内容 | 键/去重 |
|---|---|---|
| `chat_record` | 控制消息(12-15)、普通聊天、会话摘要(100) | `nano_id` `UNIQUE`（`INSERT OR IGNORE` / `INSERT OR REPLACE`） |
| `webrtc_signal` | 一次通话的 offer/answer/candidate/end 明细 | `id` 自增，按 `session_id` 查询 |
| `chat_record_send` / `chat_record_ack` | 发送队列与回执（所有经 `send_text_msg` 的消息） | `send_id` |

**会话摘要**：`chat_record` 中 `text_type=100` 的记录以 `nano_id = "session::<session_id>"` 作为稳定键，用 `INSERT OR REPLACE` 随信令状态更新：
- `offer` → 「发起通话」（raw 含 SDP）
- `answer` → 「已接听」
- `end`   → 「通话结束」
- `candidate` / 其它 → 仅写 `webrtc_signal` 明细，不更新摘要。

**摘要 raw** 复用 `WebRTCSignalRecord`（`src-tauri/src/entity/chat_record_raw.rs`），保留完整的 `data`(SDP)：
```json
{ "prev_id": "...", "type": "offer|answer|end", "sender": "...", "receiver": "...", "sessionId": "...", "data": { ...sdp... }, "timestamp": 1234 }
```

落库逻辑在 `src-tauri/src/dao/webrtc_signal_db.rs::save_webrtc_signal`，三个入口都会调用：
1. 在线接收：`process_text_msg_from_server.rs::process_webrtc_signal`
2. 发送方回执（ACK）：`process_text_msg_from_server.rs::process_ack_type`（`text_type==100` 分支）
3. 离线兜底：`user_service.rs::get_unread_message`（`text_type==100` 分支，服务端已不存信号，此分支为升级前兜底）

## 4. 完整流程状态机

```
A(主叫, offer方)                                B(被叫)
点击"发起视频通话"
  生成 sessionId (每次唯一)
  发 12-INVITE (文本) ──────────────►  收 12 → 显示邀请卡 [允许/拒绝]
                                          ├─ 允许 → 发 13-ACCEPT ──┐
                                          └─ 拒绝 → 发 14-REJECT ─┐│
收 13 → 开 WebRTC 窗口(initiator) ◄─────────┘中 B 开窗口(responder)等待 offer
  createOffer ── 发 100-offer ──────────► 窗口听 100-offer
                                                    handleOffer → createAnswer
收 100-answer ◄────────── 发 100-answer ──────────┘
双方交换 100-candidate（若启用 trickle）
  RTCPeerConnection 建立 → DataChannel/媒体流 直连（不再过服务器）
结束：一方关窗 → 发 100-end ──────────► 对方收 100-end → closeConnection 关窗
```

窗口标签：`webrtc-chat-<friendId>`，同一好友至多一个窗口（`MAX_WEBRTC_WINDOWS = 2`）。

## 5. 关键实现点

- **发起** `FooterToolBar.startWebRTCChat`：生成 `sessionId`、写入 `service.sessionId`、`setPendingWebRTCCall(friendId, sessionId)`，再 `invoke('send_text_msg', { text_type: 12, ... })`。**不再直接开窗**。
- **被叫允许** `CallInviteMessage`：发 `13-ACCEPT`，再 `openWebRTCChatHandler(friendId, meUuid, false)`（responder，等待 offer）。
- **主叫接受到** `Chat/index.tsx` 监听 `textMessage`：`text_type===13` → `openWebRTCChatHandler(friendId, meUuid, true, undefined, getPendingWebRTCCall(friendId))`；`text_type===14` → 清除 pending。
- **窗口内注入 sessionId** `WebRTC/Chat/index.tsx`：URL `sessionId` → `service.sessionId = sessionId`，保证 offer 携带正确会话。
- **信令只在窗口内处理**：`WebRTC/Chat/index.tsx` 监听 `webrtc_signal`(100) 并分发 `handleAnswer / handleOffer(ICE重启) / handleCandidate / end`；主窗 `useWebRTCSignalApi` **不再**监听信令自动开窗。
- **`set_prev_id`**（`chat_service.rs`）对 `12-15` 直接 `Ok(raw.to_string())`（控制消息不注入 prev_id）；对 `100` 走 `WebRTCSignalRecord`。
- **单聊分发**（`process_text_msg_from_server.rs::process_msg`）：`12-15` 并入单聊分支，走 `process_private_chat_message`（落库 + Emit + 会话）。

## 6. 服务器（only-talk-rs）行为

- `process_msg_service.rs`：对所有非 `MSG_TYPE_PING` 的单聊消息按 `recv_user` 路由；`12-15`（控制）照常 `add_user_chat_record` 持久化；`100`（信令）跳过持久化仅转发 + ACK。
- 因此控制消息会进入离线未读回放（`get_unread_message`），信令不会。

## 7. 已知边界/限制

- 邀请/接受依赖**当前所在会话窗口**的 `useMessageApi` 监听；若主叫未停留在与对方会话页，`13` 可能不会触发开窗。
- 移动端仅对控制消息做预览对齐（`[通话]`/`[已接听]` 等），暂无接听/拒绝交互。
- `WebRTCService` 为单例；`sessionId` 在每次发起/开窗时注入，尽量避免多路并发通话导致的会话串扰。
