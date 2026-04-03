# WebRTC 快速参考手册

## 📚 文件位置速查表

| 模块 | 文件路径 | 描述 |
|------|--------|------|
| **类型定义** | `packages/types/src/webrtc/index.ts` | WebRTC相关接口定义 |
| **核心服务** | `apps/pc/src/services/webrtcService/index.ts` | WebRTCService类实现 |
| **聊天UI** | `apps/pc/src/pages/WebRTC/Chat/index.tsx` | WebRTC聊天窗口组件 |
| **聊天样式** | `apps/pc/src/pages/WebRTC/Chat/index.less` | 聊天界面样式 |
| **Rust P2P** | `src-tauri/src/service/p2p_service.rs` | Rust后端P2P服务 |
| **命令处理** | `src-tauri/src/cmd/p2p_controller.rs` | Tauri命令处理器 |
| **消息类型** | `src-tauri/src/utils/message_types.rs` | 消息类型常量定义 |

---

## 🔄 关键流程速查

### 发起P2P连接
```javascript
// 1. 从UI层调用
sendRequestToP2p(friendId)
  ↓
// 2. Tauri调用后端
invoke('send_p2p_init_msg', { accept_user: friendId })
  ↓
// 3. Rust后端处理并转发
P2pService::send_p2p_init_msg()
  ↓
// 4. 对端收到并打开WebRTC Chat窗口
emit('webrtc_signal', offerData)
```

### 交换信令消息
```
发起方创建offer
    ↓
invoke('send_text_msg', { text_type: 100, ... })
    ↓
Rust后端转发(QUIC)
    ↓
对端收到并处理
    ↓
emit('webrtc_signal', messageData)
    ↓
前端React监听并处理
```

### 建立数据连接
```
RTCPeerConnection.connectionState
  'new' → 'connecting' → 'connected'
              ↑                ↓
         offer/answer       DataChannel.onopen
         candidate              ↓
              ↑            可以发送消息
         双方交换
```

---

## 💡 常用代码片段

### 初始化WebRTC服务
```typescript
import { initWebRTCService } from '@/services/webrtcService';

const webrtcService = initWebRTCService(currentUserId);
```

### 创建offer(发起方)
```typescript
const offer = await webrtcService.createOffer(friendId);
await webrtcService.sendSignal({
  type: 'offer',
  sender: currentUserId,
  receiver: friendId,
  sessionId: webrtcService.sessionId,
  data: offer,
  timestamp: Date.now()
});
```

### 处理offer(响应方)
```typescript
const answer = await webrtcService.handleOffer(friendId, offer);
await webrtcService.sendSignal({
  type: 'answer',
  sender: currentUserId,
  receiver: friendId,
  sessionId,
  data: answer,
  timestamp: Date.now()
});
```

### 处理候选消息(双方)
```typescript
if (signalMsg.type === 'candidate') {
  await webrtcService.handleCandidate(friendId, signalMsg.data);
}
```

### 发送消息(已连接时)
```typescript
const success = webrtcService.sendMessage(friendId, 'Hello');
if (success) {
  console.log('消息发送成功');
} else {
  console.error('发送失败，连接未建立');
}
```

### 监听消息
```typescript
webrtcService.setOnMessageCallback((fromFriendId, message) => {
  console.log(`来自${fromFriendId}的消息:`, message);
});
```

### 监听连接状态
```typescript
webrtcService.setOnConnectionStateChange((friendId, state) => {
  if (state === 'connected') {
    console.log('P2P连接已建立，可以聊天');
  } else if (state === 'failed') {
    console.log('P2P连接失败');
  }
});
```

### 监听信令事件(前端)
```typescript
useEffect(() => {
  const unlisten = await listen<string>('webrtc_signal', async (event) => {
    const msgVo: TextQuicMsgVo = JSON.parse(event.payload);
    const signalMsg = JSON.parse(msgVo.raw);

    // 处理offer
    if (signalMsg.type === 'offer') {
      const answer = await service.handleOffer(friendId, signalMsg.data);
      await service.sendSignal({ type: 'answer', ... });
    }
    // 处理answer
    else if (signalMsg.type === 'answer') {
      await service.handleAnswer(friendId, signalMsg.data);
    }
    // 处理candidate
    else if (signalMsg.type === 'candidate') {
      await service.handleCandidate(friendId, signalMsg.data);
    }
  });

  return () => unlisten?.();
}, [friendId]);
```

### 关闭连接
```typescript
await webrtcService.closeConnection(friendId);
// 或关闭所有连接
webrtcService.closeAllConnections();
```

---

## 🎯 WebRTCService API 一览

### 构造函数
```typescript
constructor(localUserId: string)
```

### 配置方法
```typescript
// 设置消息回调
setOnMessageCallback(callback: (friendId, message) => void): void

// 设置连接状态变化回调
setOnConnectionStateChange(callback: (friendId, state) => void): void
```

### 连接管理
```typescript
// 创建连接
createConnection(friendId: string): Promise<RTCPeerConnection>

// 创建offer
createOffer(friendId: string): Promise<RTCSessionDescriptionInit>

// 处理offer
handleOffer(friendId: string, offer): Promise<RTCSessionDescriptionInit>

// 处理answer
handleAnswer(friendId: string, answer): Promise<void>

// 处理候选
handleCandidate(friendId: string, candidate): Promise<void>
```

### 消息传输
```typescript
// 发送信令
sendSignal(signalMessage: WebRTCSignalMessage): Promise<void>

// 发送数据消息
sendMessage(friendId: string, message: string): boolean

// 关闭单个连接
closeConnection(friendId: string): Promise<void>

// 关闭所有连接
closeAllConnections(): void
```

### 状态查询
```typescript
// 获取连接状态
getConnectionState(friendId: string): RTCPeerConnectionState | null

// 检查DataChannel是否打开
isDataChannelOpen(friendId: string): boolean
```

### 公共属性
```typescript
// 会话ID
public sessionId: string
```

---

## 📊 消息类型定义

### WebRTCSignalMessage (信令消息)
```typescript
{
  type: 'offer' | 'answer' | 'candidate',
  sender: string,           // 发送方用户ID
  receiver: string,         // 接收方用户ID
  sessionId: string,        // 会话ID
  data: {...},              // 具体数据
  timestamp: number         // 时间戳(ms)
}
```

### TextQuicMsgVo (QUIC传输格式)
```typescript
{
  nano_id: string,         // 消息唯一ID
  text_type: number,       // 消息类型 (100=WebRTC信令)
  raw: string,             // JSON序列化内容
  recv_user: string,       // 接收方
  send_user: string,       // 发送方
  timestamp: number        // 时间戳
}
```

### ChatMessageItem (UI消息项)
```typescript
{
  id: string,              // 消息ID
  text: string,            // 消息内容
  isMine: boolean,         // 是否为当前用户
  timestamp: number        // 时间戳
}
```

---

## 🔌 Tauri命令与事件

### 前端调用的命令
```javascript
// 发送文本消息(包括WebRTC信令)
invoke('send_text_msg', { textQuicMsg: {...} })

// 其他P2P命令
invoke('send_p2p_init_msg', { accept_user: 'userId' })
invoke('process_init_p2p_request', { agree: true, user_id: 'userId' })
invoke('close_p2p_connection', { user_id: 'userId' })
```

### 前端监听的事件
```javascript
// WebRTC信令事件(来自后端)
listen('webrtc_signal', (event) => {
  // event.payload: TextQuicMsgVo JSON字符串
})

// P2P请求事件
listen('p2p_request', (event) => {
  // 处理新的P2P请求
})

// 视频帧事件
listen('video_frame', (event) => {
  // 处理视频帧
})
```

---

## ⚙️ 配置参数说明

### RTCConfiguration
```javascript
{
  iceServers: [],              // ICE服务器 (STUN/TURN)
  iceTransportPolicy: 'all',   // 'all'(所有候选) 或 'relay'(仅中继)
  bundlePolicy: 'max-bundle',  // 媒体束策略
  iceCandidatePoolSize: 10,    // 候选池大小
}
```

### RTCDataChannel 配置
```javascript
connection.createDataChannel('webrtc-chat', {
  ordered: true,               // 保证消息顺序
  maxPacketLifeTime: 3000,     // 单个消息最长存活时间(ms)
  maxRetransmits: 3,           // 最大重传次数
  negotiated: false,           // 是否预协商
})
```

---

## 🐛 常见错误及解决

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| 连接一直 'connecting' | ICE失败或信令未传输 | 检查网络、防火墙、Rust后端转发 |
| DataChannel未打开 | 连接未建立 | 等待connectionState='connected' |
| 消息发送失败 | DataChannel未打开 | 检查 `isDataChannelOpen()` |
| 收不到信令 | 后端未emit或前端未监听 | 检查事件名称和监听器 |
| 内存泄漏 | 未清理连接 | 调用 `closeAllConnections()` |

---

## 📱 URL参数参考

### WebRTC Chat 窗口URL格式
```
/webrtc/chat?
  friendId=userId&
  initiator=true/false&
  localUserId=currentUserId&
  signalData=encodedOfferJson
```

| 参数 | 类型 | 说明 |
|------|------|------|
| friendId | string | 对方用户ID |
| initiator | boolean | true=发起方, false=响应方 |
| localUserId | string | 当前用户ID |
| signalData | string | URL编码的初始offer (仅响应方需要) |

---

## 🚀 性能优化建议

1. **减少候选交换**: 过滤relay候选，减少网络开销
2. **启用TRICKLE ICE**: 逐步发送候选而不是等待完整列表
3. **消息分片**: 大文件消息需要手动分片
4. **连接复用**: 同一个friendId多次通话时重用连接
5. **资源清理**: 及时关闭不用的连接，避免内存泄漏

---

## 📖 相关文档

- [WebRTC 完整流程文档](./WebRTC_CHAT_DOCUMENTATION.md)
- [WebRTC 官方规范](https://www.w3.org/TR/webrtc/)
- [Tauri 官方文档](https://tauri.app/)
- [Rust Tokio 文档](https://tokio.rs/)

---

**版本**: 1.0 | **更新**: 2026-04-03
