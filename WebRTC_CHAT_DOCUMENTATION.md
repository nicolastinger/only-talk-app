# WebRTC P2P 聊天系统 完整文档

## 📋 目录
1. [系统概述](#系统概述)
2. [架构设计](#架构设计)
3. [完整通信流程](#完整通信流程)
4. [核心模块说明](#核心模块说明)
5. [关键技术点](#关键技术点)
6. [故障排查](#故障排查)

---

## 系统概述

### 功能定义
本系统是一个基于WebRTC的P2P直连聊天应用，属于Tauri框架下的桌面应用模块。

**核心特性：**
- ✅ **P2P直连**: 消息直接在两端传输，不经过服务器
- ✅ **隐私安全**: 窗口关闭后消息消失，无持久化存储
- ✅ **跨平台**: 基于Tauri框架，支持多平台桌面应用
- ✅ **实时通信**: 基于WebRTC DataChannel，低延迟传输

### 应用场景
- 即时文本聊天
- 隐私对话(不希望服务器保存聊天记录)
- P2P应用原型开发

### 技术栈概览
```
前端层:
├─ React 18 + TypeScript
├─ UMI框架(路由、状态管理)
├─ Ant Design(UI组件)
├─ RTCPeerConnection + RTCDataChannel(WebRTC核心)
└─ Tauri API(与后端通信)

后端层:
├─ Rust + Tauri框架
├─ QUIC协议(quinn库)
├─ Tokio异步运行时
└─ Socket通信

通信协议:
├─ 信令层: QUIC隧道 (MSG_TYPE_WEBRTC_SIGNAL=100)
└─ 数据层: RTCDataChannel (P2P直连)
```

---

## 架构设计

### 系统分层架构

```
┌─────────────────────────────────────────────────────────┐
│                   WebRTC Chat UI                         │
│  (/pages/WebRTC/Chat/index.tsx - React组件)             │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│            WebRTC Service Layer                          │
│  (/services/webrtcService/index.ts)                     │
│  - RTCPeerConnection管理                                │
│  - RTCDataChannel管理                                   │
│  - 信令消息处理(offer/answer/candidate)                 │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│           Tauri IPC Layer (invoke/listen/emit)           │
│  - invoke('send_text_msg'): 发送信令                    │
│  - listen('webrtc_signal'): 监听信令                    │
│  - emit('video_frame'): 视频帧回调                      │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│          Rust Backend (Tauri Commands)                   │
│  - send_text_msg: 通过QUIC发送信令消息                  │
│  - process_init_p2p_request: P2P请求处理                │
│  - close_p2p_connection: 连接清理                       │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│        QUIC Service (P2P Communication)                  │
│  - P2P客户端/服务端                                     │
│  - 信令消息路由                                         │
│  - UDP端口管理                                          │
└─────────────────────────────────────────────────────────┘
```

### 模块依赖关系

```
types/webrtc (类型定义)
    ↓
services/webrtcService (业务逻辑)
    ↓
pages/WebRTC/Chat (UI层)
    ├─→ Tauri API (IPC通信)
    └─→ services/webrtcService (服务调用)
```

---

## 完整通信流程

### 1. 整体流程图

```
┌────────────────────────────────────────────────────────────────────┐
│ 用户A (发起方)                        用户B (响应方)               │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ 1. 点击发起P2P请求按钮                                            │
│    ↓                                                                │
│ 2. sendRequestToP2p()                                              │
│    └─→ send_init_p2p_udp()    ───UDP探针──→                       │
│    └─→ send_p2p_init_msg()    ───QUIC────→  接收P2P初始化请求     │
│                                 (type=MSG_TYPE_P2P)                │
│                                                               ↓     │
│ 3. 后端处理请求                                              │     │
│    WebRTCService初始化                   后端转发到前端:      │     │
│                                          emit('webrtc_signal')     │
│                                               ↓                    │
│                                          打开WebRTC Chat窗口       │
│                                               ↓                    │
│ 4. 创建RTCPeerConnection                        创建RTCPeerConnection
│    initWebRTCService()                         initWebRTCService()
│         ↓                                               ↓           │
│ 5. 创建Offer并发送                           解析URL参数获取offer   │
│    createOffer()                               ↓                   │
│    sendSignal(offer)                      handleOffer()          │
│    ├─→invoke('send_text_msg')             ├─→createAnswer()       │
│    │   (text_type=100)      ─────────────→ └─→sendSignal(answer)  │
│    │                        QUIC信令通道                           │
│    │                                          ├─→invoke('send_text_msg')
│    │                        ←─────────────    │   (text_type=100)
│    │          answer回来     QUIC信令通道      └─→emit('webrtc_signal')
│    │                                               (发回给A的answer)
│    ↓                                                              │
│ 6. handleAnswer()                                                │
│    ├─→setRemoteDescription(answer)                              │
│    └─→等待ICE候选                                              │
│                                                                   │
│ 7. 候选者交换 (双向) ←──────QUIC通道 candidate ──────→           │
│    handleCandidate()  ←─ emit('webrtc_signal') ─→ handleCandidate
│         ↓                                               ↓         │
│ 8. RTCPeerConnection.connectionState = 'connected'               │
│    setConnectionStatus('connected')     setConnectionStatus('connected')
│         ↓                                               ↓         │
│ 9. DataChannel建立                                              │
│    可以发送消息 ◄────────── RTCDataChannel ──────────→可以接收消息
│                                                                   │
│ 10. 聊天交互                                                     │
│     sendMessage()  ────────── P2P直连 ──────────→ onmessage      │
│                                                                   │
└────────────────────────────────────────────────────────────────────┘
```

### 2. 信令交换详细流程

#### Phase 1: Offer创建与发送
```javascript
// 发起方 (A) 的代码执行流程
1. const offer = await webrtcService.createOffer(friendId)
   ├─ 创建RTCPeerConnection
   ├─ 创建'webrtc-chat' DataChannel (ordered=true)
   ├─ 调用connection.createOffer()
   ├─ 调用connection.setLocalDescription(offer)
   └─ 返回offer对象

2. const signalMessage: WebRTCSignalMessage = {
     type: 'offer',
     sender: 'userA',
     receiver: 'userB',
     sessionId: 'abc123xyz',
     data: offer,
     timestamp: 1234567890
   }

3. await webrtcService.sendSignal(signalMessage)
   ├─ JSON.stringify(signalMessage)
   ├─ invoke('send_text_msg', {
   │   textQuicMsg: {
   │     nano_id: 'uuid1',
   │     text_type: 100,  // MSG_TYPE_WEBRTC_SIGNAL
   │     raw: '{...offer...}',
   │     recv_user: 'userB',
   │     send_user: 'userA',
   │     timestamp: 1234567890
   │   }
   │ })
   └─ Rust后端通过QUIC发送给对端
```

#### Phase 2: Offer接收与Answer创建
```javascript
// 响应方 (B) 的代码执行流程
1. 监听 'webrtc_signal' 事件 (来自Rust后端的emit)
   await listen('webrtc_signal', (event) => {
     const msgVo: TextQuicMsgVo = JSON.parse(event.payload)
     const signalMsg: WebRTCSignalMsgRaw = JSON.parse(msgVo.raw)

     if (signalMsg.type === 'offer') {
       // 处理offer
     }
   })

2. const answer = await webrtcService.handleOffer(friendId, offer)
   ├─ 创建RTCPeerConnection
   ├─ connection.setRemoteDescription(new RTCSessionDescription(offer))
   ├─ 调用connection.createAnswer()
   ├─ connection.setLocalDescription(answer)
   └─ 返回answer对象

3. await webrtcService.sendSignal(answerMessage)
   ├─ 构建并发送answer
   └─ 通过QUIC转发回A
```

#### Phase 3: Answer接收与Candidate交换
```javascript
// 发起方 (A) 接收Answer
1. 监听 'webrtc_signal' 事件
   if (signalMsg.type === 'answer') {
     await service.handleAnswer(friendId, signalMsg.data)
   }

2. connection.setRemoteDescription(new RTCSessionDescription(answer))
   // 至此双方都已交换媒体能力，开始ICE候选收集

3. 双方都会触发 onicecandidate 事件
   connection.onicecandidate = async (event) => {
     if (event.candidate && event.candidate.type !== 'relay') {
       // 构建candidate信令并发送
       await sendSignal(candidateMessage)
     }
   }

4. 对端接收candidate
   if (signalMsg.type === 'candidate') {
     await service.handleCandidate(friendId, signalMsg.data)
     // connection.addIceCandidate(candidate)
   }
```

#### Phase 4: 连接建立
```javascript
// 连接状态变化监听
connection.onconnectionstatechange = () => {
  // 状态转移:
  // 'new' -> 'connecting' -> 'connected' -> 'disconnected'/'closed'/'failed'

  if (connection.connectionState === 'connected') {
    setConnectionStatus('connected')
    // DataChannel已建立，可以发送消息
    console.log('P2P连接已建立!')
  }
}
```

### 3. 消息发送流程

```
发送方:
  1. 用户输入文本
  2. 点击发送按钮
  3. sendMessage(friendId, text)
     ├─ 获取DataChannel
     ├─ 检查readyState === 'open'
     └─ channel.send(text)
           ↓
           RTCDataChannel 直连传输(不经过服务器)
           ↓
接收方:
  1. channel.onmessage = (event) => {
       const message = event.data
       // 显示消息
     }
  2. 触发 onMessageCallback
     ├─ 构建ChatMessageItem
     └─ 更新消息列表UI
```

### 4. 连接关闭流程

```
用户点击退出按钮
        ↓
handleExit()
  ├─ getWebRTCService()
  ├─ closeConnection(friendId)
  │  ├─ dataChannel.close()
  │  ├─ dataChannels.delete(friendId)
  │  ├─ connection.close()
  │  └─ connections.delete(friendId)
  └─ window.getCurrentWindow().close()
           ↓
        WebRTC窗口关闭
        消息不再保存
```

---

## 核心模块说明

### 1. 类型定义模块 (packages/types/src/webrtc/index.ts)

#### WebRTCSignalMessage (信令消息接口)
```typescript
interface WebRTCSignalMessage {
  type: 'offer' | 'answer' | 'candidate';
  sender: string;              // 发送方用户ID
  receiver: string;            // 接收方用户ID
  sessionId: string;           // 会话标识，关联一次完整连接
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;           // 消息时间戳
}
```

**说明：** 用于交换WebRTC连接信息，是两个对等端之间同步状态的媒介。

#### WebRTCSession (会话接口)
```typescript
interface WebRTCSession {
  sessionId: string;                    // 会话ID
  friendId: string;                     // 对方用户ID
  connection: RTCPeerConnection | null; // 连接对象
  dataChannel: RTCDataChannel | null;   // 数据通道
  isInitiator: boolean;                 // 是否为发起方
  status: 'connecting' | 'connected' | 'disconnected' | 'failed';
}
```

**说明：** 代表一次完整的P2P会话，包含连接和数据通道的完整状态。

### 2. WebRTC服务模块 (apps/pc/src/services/webrtcService/index.ts)

#### 类: WebRTCService

**职责：**
- 管理RTCPeerConnection的生命周期
- 处理offer/answer/candidate信令
- 管理RTCDataChannel
- 提供消息收发接口

**关键方法：**

| 方法 | 说明 | 使用者 |
|------|------|--------|
| `createConnection(friendId)` | 创建新的RTCPeerConnection | 内部调用 |
| `createOffer(friendId)` | 创建offer | 发起方 |
| `handleOffer(friendId, offer)` | 处理offer | 响应方 |
| `handleAnswer(friendId, answer)` | 处理answer | 发起方 |
| `handleCandidate(friendId, candidate)` | 处理ICE候选 | 双方 |
| `sendSignal(signalMessage)` | 发送信令 | 内部调用 |
| `sendMessage(friendId, text)` | 发送数据 | UI层 |
| `closeConnection(friendId)` | 关闭连接 | UI层 |
| `closeAllConnections()` | 关闭所有连接 | 卸载时 |
| `isDataChannelOpen(friendId)` | 检查通道状态 | UI层 |

**状态回调：**
```typescript
// 消息接收回调
setOnMessageCallback((friendId: string, message: string) => {
  // 处理来自对端的消息
})

// 连接状态变化回调
setOnConnectionStateChange((friendId: string, state: RTCPeerConnectionState) => {
  // 更新UI连接状态
})
```

### 3. UI组件模块 (apps/pc/src/pages/WebRTC/Chat/index.tsx)

#### 组件: WebRTCChat

**职责：**
- 渲染WebRTC聊天界面
- 管理消息列表展示
- 处理用户输入和发送
- 监听信令事件
- 管理连接状态显示

**核心Effect：**

| Effect | 触发条件 | 功能 |
|--------|---------|------|
| Effect 1 | 消息列表变化 | 自动滚动到底部 |
| Effect 2 | 组件挂载 | 初始化WebRTC服务，发起或处理连接 |
| Effect 3 | friendId变化 | 监听 'webrtc_signal' 事件 |

**URL参数：**
```
/webrtc/chat?friendId=user2&initiator=true&localUserId=user1&signalData=...
```

---

## 关键技术点

### 1. WebRTC核心概念

#### RTCPeerConnection
- **作用**: 代表两个对等端之间的连接
- **生命周期**:
  ```
  new RTCPeerConnection()
     ↓
  setLocalDescription(offer/answer)
     ↓
  setRemoteDescription(offer/answer)
     ↓
  addIceCandidate(candidate)
     ↓
  connectionState === 'connected'
  ```

#### RTCDataChannel
- **作用**: 在P2P连接上建立可靠的有序数据通道
- **创建方式**:
  - 发起方: `connection.createDataChannel('label')`
  - 响应方: `connection.ondatachannel = (event) => { event.channel }`

#### ICE (Interactive Connectivity Establishment)
- **作用**: 建立两个对等端之间可达的媒体路径
- **候选地址类型**:
  - `host`: 本地网络接口地址
  - `srflx`: 经过NAT映射后的公网地址
  - `relay`: 中继服务器地址 (项目中被过滤)

### 2. 信令通道设计

**为什么需要单独的信令通道？**
- WebRTC的offer/answer/candidate需要通过外部通道传输
- 项目使用QUIC作为信令通道，确保可靠传输

**信令消息类型 (MSG_TYPE_WEBRTC_SIGNAL = 100)：**
```
文本消息 (MSG_TYPE_TEXT)
   ↓
invoke('send_text_msg') 调用Rust后端
   ↓
后端通过QUIC发送
   ↓
后端处理消息类型
   ├─ 100: WebRTC信令 -> emit('webrtc_signal')
   └─ 其他: 普通消息 -> emit('text_msg')
```

### 3. NAT穿透策略

**当前配置：**
```javascript
const DEFAULT_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [],              // 不使用STUN/TURN
  iceTransportPolicy: 'all',   // 使用所有候选
  bundlePolicy: 'max-bundle',  // 单束复用
}
```

**适用场景：**
- ✅ 同局域网设备之间 (局域网直连)
- ❌ 跨公网的陌路人 (需要STUN/TURN服务器)

**改进建议：**
```javascript
// 如需支持公网穿透
const config: RTCConfiguration = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302'],
      username: '',
      credential: ''
    },
    // 添加TURN服务器支持中继
  ],
  iceTransportPolicy: 'all',  // 或 'relay'
}
```

### 4. 会话管理

**单例模式实现：**
```javascript
let webRTCServiceInstance: WebRTCService | null = null;

export const initWebRTCService = (localUserId: string): WebRTCService => {
  if (!webRTCServiceInstance) {
    webRTCServiceInstance = new WebRTCService(localUserId);
  }
  return webRTCServiceInstance;
};
```

**优势：**
- 确保全应用只有一个WebRTCService实例
- 所有连接集中管理
- 资源回收统一处理

### 5. 消息有序传输

**RTCDataChannel配置：**
```javascript
connection.createDataChannel('webrtc-chat', {
  ordered: true,  // 保证消息顺序
})
```

**消息顺序保证：**
- `ordered: true` 确保接收消息顺序与发送顺序一致
- 项目中所有消息都采用有序传输

---

## 故障排查

### 问题1: 连接状态一直为 'connecting'

**可能原因：**
1. ICE候选收集失败
2. 信令消息未正确传输
3. 防火墙阻止UDP

**排查步骤：**
```javascript
// 检查浏览器控制台
1. 查看是否有offer/answer/candidate消息
2. 检查connectionState变化日志
3. 检查后端QUIC消息是否正确转发

// 添加调试日志
connection.onicecandidate = (event) => {
  console.log('ICE候选:', event.candidate?.type, event.candidate?.address)
}
connection.onicegatheringstatechange = () => {
  console.log('ICE收集状态:', connection.iceGatheringState)
}
```

### 问题2: DataChannel打不开

**可能原因：**
1. RTCPeerConnection连接未建立
2. 响应方未正确处理offer
3. DataChannel创建时机不当

**排查步骤：**
```javascript
// 监听DataChannel事件
channel.onopen = () => {
  console.log('DataChannel已打开')
}
channel.onclose = () => {
  console.log('DataChannel已关闭')
}
channel.onerror = (error) => {
  console.error('DataChannel错误:', error)
}
```

### 问题3: 消息发送失败

**可能原因：**
1. DataChannel未打开
2. 消息过大 (超过通道限制)
3. 对端连接已断开

**排查步骤：**
```javascript
const success = service.sendMessage(friendId, message);
if (!success) {
  const isOpen = service.isDataChannelOpen(friendId);
  const state = service.getConnectionState(friendId);
  console.error('发送失败', { isOpen, state })
}
```

### 问题4: 信令消息未收到

**可能原因：**
1. Rust后端未正确处理MSG_TYPE_WEBRTC_SIGNAL
2. emit('webrtc_signal')未触发
3. 事件监听器未正确注册

**排查步骤：**
```javascript
// 检查监听器是否正确注册
useEffect(() => {
  const unlisten = await listen('webrtc_signal', (event) => {
    console.log('收到信令事件:', event.payload);
  });
  return () => unlisten?.();
}, []);

// 检查发送端是否正确调用send_text_msg
await invoke('send_text_msg', {
  textQuicMsg: {
    text_type: 100,  // 必须是100
    // 其他字段...
  }
})
```

### 问题5: 连接被意外断开

**可能原因：**
1. 网络中断
2. 对端主动关闭
3. WebRTC ICE失败

**排查步骤：**
```javascript
connection.onconnectionstatechange = () => {
  if (connection.connectionState === 'failed') {
    const iceState = connection.iceConnectionState;
    console.error('连接失败，ICE状态:', iceState);
  }
}

connection.onicecandidateerror = (error) => {
  console.error('ICE候选错误:', error);
}
```

### 调试技巧

**启用详细日志：**
```javascript
// 在WebRTCService中添加日志级别
class WebRTCService {
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'debug';

  private log(level: string, message: string, data?: any) {
    console.log(`[WebRTC ${level}] ${message}`, data || '');
  }
}
```

**使用RTCStatsReport监控连接质量：**
```javascript
// 监听连接统计数据
const statsReport = await connection.getStats();
statsReport.forEach(report => {
  if (report.type === 'inbound-rtp') {
    console.log('入站码率:', report.bytesReceived);
  }
  if (report.type === 'outbound-rtp') {
    console.log('出站码率:', report.bytesSent);
  }
});
```

---

## 附录: 代码片段参考

### 快速集成示例

```typescript
// 1. 初始化服务
import { initWebRTCService } from '@/services/webrtcService';

const service = initWebRTCService('currentUserId');

// 2. 设置回调
service.setOnMessageCallback((friendId, message) => {
  console.log(`来自${friendId}的消息:`, message);
});

service.setOnConnectionStateChange((friendId, state) => {
  if (state === 'connected') {
    console.log('连接已建立');
  }
});

// 3. 发起连接(发起方)
const offer = await service.createOffer('friendId');
await service.sendSignal({
  type: 'offer',
  sender: 'currentUserId',
  receiver: 'friendId',
  sessionId: service.sessionId,
  data: offer,
  timestamp: Date.now(),
});

// 4. 处理连接(响应方)
const answer = await service.handleOffer('friendId', offer);
await service.sendSignal({
  type: 'answer',
  sender: 'currentUserId',
  receiver: 'friendId',
  sessionId: sessionId,
  data: answer,
  timestamp: Date.now(),
});

// 5. 发送消息
service.sendMessage('friendId', '你好');

// 6. 关闭连接
await service.closeConnection('friendId');
```

---

## 更新日期
- **创建日期**: 2024-XX-XX
- **最后更新**: 2026-04-03
- **版本**: 1.0
- **分支**: feature/webrtc-chat-model

---

## 联系和贡献
如有问题或改进建议，请提交Issue或Pull Request。
