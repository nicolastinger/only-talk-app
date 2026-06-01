# SystemNotification Level 层级文档

> 本文档记录 OnlyTalk IM 系统中 `SystemNotification` 通知的所有 level 组合及其含义。

## 层级定义

`SystemNotification` 使用四级层级字段来定位通知类型：

| 字段 | 含义 | 说明 |
|------|------|------|
| `level1` | 功能大类 | 1=本系统通知，2=第三方通知 |
| `level2` | 子功能模块 | 1=好友模块，2=用户通知，3=群组模块 |
| `level3` | 具体功能组 | 根据 level1+level2 不同而不同 |
| `level4` | 详细功能项 | 当前未使用，保留为 0 |

## 完整组合列表

### level1 = 1（本系统通知）

#### level1=1, level2=1 — 好友模块

| level3 | level4 | 名称 | 含义 | 后端构造函数 | 客户端处理 |
|--------|--------|------|------|-------------|-----------|
| 1 | 0 | 好友发起请求通知 | A 向 B 发送好友请求，B 收到此通知 | `send_request_friend_msg()` | 触发 `friend_list_changed` 事件，前端增加联系人未读角标 |
| 2 | 0 | 好友处理通知 | B 接受/拒绝了 A 的好友请求，A 收到此通知 | `send_process_friend_msg()` | 触发 `update_friend_list()` 同步好友列表，前端增加联系人未读角标 |

#### level1=1, level2=2 — 用户本身通知

> 预留，尚未实现。

#### level1=1, level2=3 — 群组模块

| level3 | level4 | 名称 | 含义 | 后端构造函数 | 客户端处理 |
|--------|--------|------|------|-------------|-----------|
| 1 | 0 | 群邀请通知 | 用户被邀请加入群组 | `send_group_invite_msg()` | 前端可增加群组未读角标，调用 `get_pending_invitations` 获取待处理邀请 |
| 2 | 0 | 群信息更新通知 | 群组基本信息变更（名称、头像等） | 尚未构造 | `sync_group_list()` 同步群组列表 |
| 3 | 0 | 群成员变更通知 | 群成员加入/离开/被踢 | 尚未构造 | `sync_group_members(biz_id)` 同步群成员 |
| 4 | 0 | 群邀请结果通知 | 用户接受/拒绝入群邀请，通知群主/管理员 | `send_group_invite_result_msg()` | `sync_group_members(biz_id)` 同步群成员，前端增加群组未读角标 |

### level1 = 2（第三方通知）

> 预留，尚未实现。客户端仅记录日志，无具体处理逻辑。

## 未构造的 level 组合

以下组合在客户端路由代码中有分支处理，但**当前后端没有构造发送**：

| level1 | level2 | level3 | 说明 | 客户端路由位置 |
|--------|--------|--------|------|---------------|
| 1 | 2 | - | 用户本身通知 | `process_text_msg_from_server.rs` |
| 1 | 3 | 2 | 群信息更新通知 | `group_service.rs` |
| 1 | 3 | 3 | 群成员变更通知 | `group_service.rs` |
| 2 | - | - | 第三方通知 | `process_text_msg_from_server.rs` |

## 数据流

```
后端构造 SystemNotification
    │
    ▼ QUIC NOTIFY_TYPE_MSG (1024)
    │
客户端 process_msg() ──text_type=1024──▶ process_notify_message()
    │                                        │
    │                                        ▼
    │                                   写入 SQLite system_notification 表
    │                                   发送前端事件 listen_notify_msg
    │                                        │
    │                                        ▼
    │                                   process_local_notify_message()
    │                                        │
    │                    ┌───────────────────┼───────────────┐
    │                    ▼                   ▼               ▼
    │              level2=1             level2=2        level2=3
    │              好友模块              用户通知          群组模块
    │                    │                   │               │
    │                    ▼                   ▼               ▼
    │              process_friend_      (日志)         process_group_
    │              notify_message                    notify_message
    │
    ▼
前端 useSystemNotify.ts
    │
    ├── level1=1, level2=1 ──▶ setAddContacts() (联系人角标)
    ├── level1=1, level2=3 ──▶ setAddGroups() (群组角标)
    └── level3=1 (level2=1) ──▶ friend_list_changed (好友请求弹窗)
```

## 相关源码位置

| 模块 | 文件路径 |
|------|---------|
| 后端通知构造 | `only-talk-rs/crates/http_service/src/http_service/notify_service/service/system_notification.rs` |
| 客户端接收分发 | `only-talk-app/src-tauri/src/quic_service/center_service/process_text_msg_from_server.rs` |
| 好友通知处理 | `only-talk-app/src-tauri/src/service/friend_service.rs` |
| 群组通知处理 | `only-talk-app/src-tauri/src/service/group_service.rs` |
| 通知实体 | `only-talk-app/src-tauri/src/entity/system_notification.rs` |
| 前端通知监听 | `only-talk-app/apps/pc/src/hooks/useSystemNotify.ts` |
| 通知中心面板 | `only-talk-app/apps/pc/src/components/NotificationPanel/index.tsx` |
| 通知 Tauri 命令 | `only-talk-app/src-tauri/src/cmd/notification_controller.rs` |
| 通知服务 | `only-talk-app/packages/services/src/notificationService/index.ts` |

## 通知清除 API

### Rust 端

`SystemNotification::clear_unread_by_level(user_id, level1, level2, level3, level4)`
- level 传 `-1` 表示通配该层级
- 例：`(1, 1, -1, -1)` 清除所有好友模块未读通知

### Tauri 命令

`clear_unread_by_level(level1, level2, level3, level4)` -- 返回影响的行数

### 前端服务

`clearUnreadByLevel(level1, level2, level3, level4, callback?)`

### 调用示例

```ts
// 清除好友模块所有未读
clearUnreadByLevel(1, 1, -1, -1);

// 清除群组模块所有未读
clearUnreadByLevel(1, 3, -1, -1);

// 清除全部未读（level1=1 的所有通知）
clearUnreadByLevel(1, -1, -1, -1);
```
