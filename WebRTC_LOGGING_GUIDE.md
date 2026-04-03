# WebRTC 日志打印完整指南

## 📋 日志系统概述

为了帮助开发者快速定位问题和理解执行流程，在WebRTC聊天系统的关键位置添加了详细的日志打印。所有日志都可以在浏览器开发者工具（DevTools）的 Console 标签中查看。

### 日志前缀说明

使用统一的前缀格式，便于快速识别日志来源：

| 前缀 | 含义 | 示例 |
|------|------|------|
| `[WebRTCService]` | 核心服务类 | `[WebRTCService.createOffer]` |
| `[WebRTCChat]` | UI组件 | `[WebRTCChat.sendMessage]` |
| `[WebRTCService.on*]` | 事件处理器 | `[WebRTCService.onicecandidate]` |

### 符号含义

| 符号 | 含义 |
|------|------|
| ✅ | 成功 |
| ❌ | 失败 / 错误 |
| ⚠️  | 警告 / 跳过 |
| 📡 | 信令相关 |
| ✉️  | 消息相关 |

---

## 🔍 关键日志流程

### 1. 初始化阶段日志

```
[WebRTCChat] 开始初始化WebRTC连接...
[WebRTCChat] 参数 - friendId: user2, isInitiator: true, localUserId: user1

[WebRTCService] 初始化成功 - 用户ID: user1, 会话ID: abc123xyz
[WebRTCChat] WebRTCService已初始化，会话ID: abc123xyz

[WebRTCService] 消息回调已设置
[WebRTCChat] 消息回调已设置

[WebRTCService] 连接状态变化回调已设置
[WebRTCChat] 连接状态回调已设置
```

**关键信息：** 用户ID和会话ID

### 2. Offer创建阶段日志（发起方）

```
[WebRTCChat] 本端为发起方，创建offer...
[WebRTCChat] 调用 service.createOffer(user2)...

[WebRTCService.createOffer] 开始为 user2 创建offer...
[WebRTCService.createOffer] RTCPeerConnection 对象已创建
[WebRTCService.createOffer] 创建DataChannel...
[WebRTCService.setupDataChannel] 为 user2 设置DataChannel - Label: webrtc-chat, BufferedAmount: 0
[WebRTCService.setupDataChannel] DataChannel设置完成，当前总数: 1
[WebRTCService.createOffer] DataChannel 已创建

[WebRTCService.createOffer] 调用 createOffer()...
[WebRTCService.createOffer] offer 已创建，SDP长度: 2854

[WebRTCService.createOffer] 设置本地描述...
[WebRTCService.onconnectionstatechange] 连接状态: connecting (ICE状态: new, 收集状态: new)
[WebRTCService.createOffer] 本地描述已设置，连接状态: connecting

[WebRTCChat] offer创建成功
[WebRTCChat] offer信令消息已构建，准备发送...
```

**关键信息：** offer SDP长度，连接状态从 'new' 变为 'connecting'

### 3. Offer发送阶段日志

```
[WebRTCChat] 调用 service.sendSignal()...

[WebRTCService.sendSignal] 准备发送offer信令给 user2...
[WebRTCService.sendSignal] 信令详情 - sessionId: abc123xyz, 内容长度: 2900

[WebRTCService.sendSignal] ✅ offer信令已通过QUIC发送，等待对端响应...

[WebRTCChat] ✅ offer已发送，等待对端的answer和ICE候选...
```

**关键信息：** 信令内容长度，发送成功

### 4. ICE候选收集阶段日志

```
[WebRTCService.onicecandidate] 收集到ICE候选 - 类型: host, 地址: 192.168.1.100:12345
[WebRTCService.onicecandidate] 发送ICE候选给 user2
[WebRTCService.sendSignal] 准备发送candidate信令给 user2...
[WebRTCService.sendSignal] ✅ candidate信令已通过QUIC发送...

[WebRTCService.onicecandidate] 收集到ICE候选 - 类型: srflx, 地址: 203.0.113.5:54321
[WebRTCService.onicecandidate] 发送ICE候选给 user2

[WebRTCService.onicecandidate] 跳过中继候选(relay candidate)

[WebRTCService.onicecandidate] ICE候选收集完成
```

**关键信息：** 候选地址类型，IP和端口，relay被过滤

### 5. Answer处理阶段日志（响应方）

```
[WebRTCChat.onWebRTCSignal] 📡 收到WebRTC信令事件
[WebRTCChat.onWebRTCSignal] QUIC消息已解析 - nano_id: uuid1, text_type: 100
[WebRTCChat.onWebRTCSignal] 信令消息已解析 - 类型: answer, 发送方: user1, sessionId: abc123xyz

[WebRTCChat.onWebRTCSignal] 收到来自user1的answer，正在处理...

[WebRTCService.handleAnswer] 开始处理来自 user1 的answer...
[WebRTCService.handleAnswer] 设置远程描述，SDP长度: 2854
[WebRTCService.onconnectionstatechange] 连接状态: connecting (ICE状态: checking, 收集状态: new)
[WebRTCService.handleAnswer] 远程描述已设置，连接状态: connecting

[WebRTCChat.onWebRTCSignal] ✅ answer已处理
```

**关键信息：** 信令消息类型和发送方，answer SDP长度

### 6. ICE候选处理阶段日志

```
[WebRTCChat.onWebRTCSignal] 📡 收到WebRTC信令事件
[WebRTCChat.onWebRTCSignal] 信令消息已解析 - 类型: candidate, 发送方: user1, sessionId: abc123xyz
[WebRTCChat.onWebRTCSignal] 收到来自user1的ICE candidate

[WebRTCService.handleCandidate] 处理来自 user1 的candidate - 类型: host
[WebRTCService.handleCandidate] 添加ICE候选到连接...
[WebRTCService.handleCandidate] ICE候选已添加

[WebRTCService.onicecandidate] 收集到ICE候选 - 类型: host, 地址: 192.168.1.100:12345
[WebRTCService.onicecandidate] 发送ICE候选给 user1
```

**关键信息：** 候选类型，添加成功

### 7. 连接建立阶段日志

```
[WebRTCService.onconnectionstatechange] 连接状态: connected (ICE状态: connected, 收集状态: complete)

[WebRTCService.ondatachannelopen] ✅ DataChannel已打开 (friendId: user2) - 现在可以发送消息
[WebRTCService.ondatachannelopen] 通道详情 - readyState: open, bufferedAmount: 0

[WebRTCChat.onConnectionStateChange] 连接状态变化: connected
[WebRTCChat] ✅ P2P连接已建立，可以开始聊天
```

**关键信息：** 连接状态变为 'connected'，DataChannel 打开

### 8. 消息发送阶段日志

```
[WebRTCChat.sendMessage] 准备发送消息，输入内容: "你好"

[WebRTCService.isDataChannelOpen] 检查 user2 的DataChannel状态: ✅ 打开 (readyState: open)

[WebRTCChat.sendMessage] ✅ 连接就绪，调用 service.sendMessage()...

[WebRTCService.sendMessage] 准备发送消息给 user2...
[WebRTCService.sendMessage] ✅ DataChannel已就绪，发送消息: "你好" (长度: 2 字符)
[WebRTCService.sendMessage] ✅ 消息发送成功，缓冲区大小: 0

[WebRTCChat.sendMessage] ✅ 消息发送成功，添加到本地消息列表
[WebRTCChat.sendMessage] 消息已添加到UI，当前消息总数: 1
```

**关键信息：** DataChannel 打开状态，消息长度，缓冲区大小

### 9. 消息接收阶段日志

```
[WebRTCService.ondatachannelmessage] ✉️  从user1收到消息 - 内容: 你好, 时间: 14:30:45

[WebRTCChat.onMessageCallback] 收到来自user1的消息: 你好
```

**关键信息：** 消息内容，接收时间

### 10. 连接关闭阶段日志

```
[WebRTCChat.handleExit] 用户点击退出按钮，开始清理资源...
[WebRTCChat.handleExit] 调用 service.closeConnection(user2)...

[WebRTCService.closeConnection] 开始关闭与 user2 的连接...
[WebRTCService.closeConnection] 关闭DataChannel...
[WebRTCService.ondatachannelclose] DataChannel已关闭 (friendId: user2)
[WebRTCService.closeConnection] DataChannel已关闭

[WebRTCService.closeConnection] 关闭RTCPeerConnection (当前状态: connected)...
[WebRTCService.closeConnection] RTCPeerConnection已关闭

[WebRTCService.closeConnection] ✅ 连接已关闭，剩余连接数: 0

[WebRTCChat.handleExit] ✅ WebRTC连接已关闭
[WebRTCChat.handleExit] 关闭当前窗口...
[WebRTCChat.handleExit] ✅ 窗口已关闭
```

**关键信息：** 资源清理顺序，剩余连接数

---

## 🎯 常见日志场景及解析

### 场景1: 连接一直停留在 'connecting'

**日志特征：**
```
[WebRTCService.onconnectionstatechange] 连接状态: connecting (ICE状态: gathering, 收集状态: gathering)
[WebRTCService.onconnectionstatechange] 连接状态: connecting (ICE状态: checking, 收集状态: complete)
// 但始终没有 'connected'
```

**可能原因：**
1. ICE候选交换失败 - 检查是否有 `onicecandidate` 日志
2. Answer没有收到 - 检查信令监听日志
3. 防火墙阻止 - 检查是否有candidate的IP和端口信息

**排查方法：**
```javascript
// 在浏览器console查询
// 搜索所有candidate日志
console.log("查找: [WebRTCService.onicecandidate]")

// 搜索answer处理日志
console.log("查找: [WebRTCService.handleAnswer]")

// 检查ICE状态
console.log("查找: ICE状态")
```

### 场景2: DataChannel未打开

**日志特征：**
```
[WebRTCService.ondatachannelopen] ❌ (没有这行日志)
[WebRTCService.ondatachannelclose] DataChannel已关闭
```

**可能原因：**
1. 连接未达到 'connected' 状态
2. DataChannel配置错误
3. 响应方未收到offer

**排查方法：**
1. 检查连接状态日志，确保达到 'connected'
2. 搜索 "setupDataChannel" 确保初始化
3. 发起方搜索 "createDataChannel"，响应方搜索 "ondatachannel"

### 场景3: 消息发送失败

**日志特征：**
```
[WebRTCService.sendMessage] ❌ 发送失败 - DataChannel未打开 (readyState: connecting)
```

**可能原因：**
1. DataChannel还在建立过程中
2. 连接已断开
3. 对端关闭了连接

**排查方法：**
1. 检查 DataChannel readyState (应为 'open')
2. 检查连接状态 (应为 'connected')
3. 查看是否有 "ondatachannelclose" 日志

### 场景4: 信令未被接收

**日志特征：**
```
[WebRTCService.sendSignal] ✅ offer信令已通过QUIC发送...
// 但对端没有 [WebRTCChat.onWebRTCSignal] 日志
```

**可能原因：**
1. Rust后端未正确转发消息
2. 事件监听失败
3. 消息类型不是100 (MSG_TYPE_WEBRTC_SIGNAL)

**排查方法：**
1. 检查发送端的 "text_type: 100"
2. 检查接收端的监听器是否注册成功
3. 查看浏览器Network标签，检查Tauri IPC消息

---

## 📊 日志分析工具

### 1. 按时间顺序提取日志

```javascript
// 在DevTools Console输入
copy(
  Array.from(console.log.calls || [])
    .map(call => call.join(' '))
    .join('\n')
)
```

### 2. 按模块筛选日志

```javascript
// 只看WebRTCService日志
console.log(performance.getEntriesByType('measure')
  .filter(e => e.name.includes('WebRTCService'))
);
```

### 3. 统计连接建立时间

```javascript
// 在offer发送时记录时间
const startTime = Date.now();

// 在connected时记录时间
const connectedTime = Date.now();
console.log(`连接建立耗时: ${connectedTime - startTime}ms`);
```

### 4. 导出日志到文件

```javascript
// 在DevTools Console运行
copy(
  document.body.innerText
    .split('\n')
    .filter(line => line.includes('[WebRTC'))
    .join('\n')
);
// 粘贴到文件即可
```

---

## ⚙️ 日志级别

当前实现的日志级别：

| 级别 | 颜色 | 用途 |
|------|------|------|
| `console.log()` | 默认 | 普通日志 |
| `console.error()` | 红色 | 错误日志 |
| `console.warn()` | 黄色 | 警告日志(未使用) |

**改进建议：**

```typescript
// 可以添加日志级别控制
const LOG_LEVEL = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = LOG_LEVEL.DEBUG;

function log(level: number, message: string, data?: any) {
  if (level <= currentLevel) {
    console.log(message, data || '');
  }
}
```

---

## 🔐 生产环境建议

为了避免在生产环境暴露敏感信息，可以：

1. **环境变量控制：**
```typescript
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log(`[WebRTCService] ...`);
}
```

2. **日志级别控制：**
```typescript
const LOG_LEVEL = process.env.LOG_LEVEL || 'ERROR';
```

3. **日志上报：**
```typescript
// 关键错误上报到服务器
if (error) {
  reportError({
    timestamp: Date.now(),
    message: error.message,
    stack: error.stack,
    context: { friendId, sessionId }
  });
}
```

---

## 📝 调试清单

调试WebRTC问题时的检查清单：

- [ ] 确认两端都打印了初始化日志
- [ ] 发起方是否打印了offer创建日志
- [ ] 响应方是否收到了offer信令
- [ ] 双方是否都打印了candidate日志
- [ ] 连接状态是否转变为 'connected'
- [ ] DataChannel是否打印了 onopen 日志
- [ ] 消息发送和接收是否都有日志
- [ ] 关闭时是否有清理日志

---

**版本**: 1.0 | **更新**: 2026-04-03
