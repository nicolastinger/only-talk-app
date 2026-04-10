# API参考

<cite>
**本文引用的文件**
- [Cargo.toml](file://src-tauri/Cargo.toml)
- [main.rs](file://src-tauri/src/main.rs)
- [lib.rs](file://src-tauri/src/lib.rs)
- [cmd/mod.rs](file://src-tauri/src/cmd/mod.rs)
- [api_controller.rs](file://src-tauri/src/cmd/api_controller.rs)
- [auth_controller.rs](file://src-tauri/src/cmd/auth_controller.rs)
- [chat_record_controller.rs](file://src-tauri/src/cmd/chat_record_controller.rs)
- [chat_session_controller.rs](file://src-tauri/src/cmd/chat_session_controller.rs)
- [friend_controller.rs](file://src-tauri/src/cmd/friend_controller.rs)
- [notification_controller.rs](file://src-tauri/src/cmd/notification_controller.rs)
- [p2p_controller.rs](file://src-tauri/src/cmd/p2p_controller.rs)
- [file_controller.rs](file://src-tauri/src/cmd/file_controller.rs)
- [http_result.rs](file://src-tauri/src/dto/http_result.rs)
- [text_quic_msg.rs](file://src-tauri/src/vo/text_quic_msg.rs)
- [p2p_models.rs](file://src-tauri/src/entity/p2p_models.rs)
- [p2p_service.rs](file://src-tauri/src/service/p2p_service.rs)
- [message_types.rs](file://src-tauri/src/utils/message_types.rs)
- [index.ts (P2P类型)](file://packages/types/src/p2p/index.ts)
- [package.json (PC)](file://apps/pc/package.json)
- [package.json (移动端)](file://apps/mobile/package.json)
- [useP2pMessageApi.ts](file://apps/pc/src/hooks/useP2pMessageApi.ts)
</cite>

## 更新摘要
**变更内容**
- 新增文件传输相关API接口章节
- 添加send_p2p_file_data、send_p2p_file_transfer_request、send_p2p_file_transfer_response三个Tauri命令
- 新增FileData、FileTransferRequest、FileTransferResponse等TypeScript接口定义
- 扩展P2P通信协议，支持文件分片传输和握手确认机制
- 更新P2P通道类型，增加File通道专用传输通道

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [文件传输API](#文件传输api)
7. [依赖关系分析](#依赖关系分析)
8. [性能与并发特性](#性能与并发特性)
9. [故障排查与错误码](#故障排查与错误码)
10. [结论](#结论)
11. [附录](#附录)

## 简介
本文件为即时通讯应用的API参考文档，覆盖后端REST API与前端Tauri命令接口两大部分。内容包括：
- 后端REST API：HTTP方法、URL模式、请求/响应格式、认证机制
- 前端命令接口：通过Tauri暴露的命令（invoke）能力，统一的调用方式与参数规范
- 即时通信协议：文本消息、图片消息、P2P点对点通信、WebRTC信号与媒体流
- **新增文件传输API：支持大文件分片传输、握手确认机制、文件通道专用传输**
- 数据模型与事件：消息VO、系统通知、错误与状态码
- 版本管理与兼容性：版本号、迁移建议与注意事项
- 集成示例与最佳实践：参数、返回值、异常处理策略

## 项目结构
后端采用Rust + Tauri，前端使用Vue3 + TypeScript。Tauri在运行时将Rust命令注册为前端可调用的invoke接口；同时内置HTTP客户端封装常用网络请求。

```mermaid
graph TB
subgraph "前端(PC)"
PC_PKG["apps/pc/package.json"]
PC_APP["PC 应用入口<br/>调用 Tauri 命令"]
USE_P2P["useP2pMessageApi Hook<br/>处理P2P事件"]
end
subgraph "前端(移动端)"
MOB_PKG["apps/mobile/package.json"]
MOB_APP["移动端 应用入口<br/>调用 Tauri 命令"]
end
subgraph "后端(Tauri)"
MAIN["src-tauri/src/main.rs"]
LIB["src-tauri/src/lib.rs"]
MOD["src-tauri/src/cmd/mod.rs"]
API["api_controller.rs"]
AUTH["auth_controller.rs"]
CHAT["chat_record_controller.rs"]
SESSION["chat_session_controller.rs"]
FRIEND["friend_controller.rs"]
NOTI["notification_controller.rs"]
P2P["p2p_controller.rs"]
FILE["file_controller.rs"]
DTO["dto/http_result.rs"]
VO["vo/text_quic_msg.rs"]
MODELS["entity/p2p_models.rs"]
SERVICE["service/p2p_service.rs"]
MSG_TYPES["utils/message_types.rs"]
end
PC_APP --> LIB
MOB_APP --> LIB
USE_P2P --> LIB
LIB --> MOD
MOD --> API
MOD --> AUTH
MOD --> CHAT
MOD --> SESSION
MOD --> FRIEND
MOD --> NOTI
MOD --> P2P
MOD --> FILE
API --> DTO
CHAT --> VO
SESSION --> VO
P2P --> MODELS
P2P --> SERVICE
SERVICE --> MSG_TYPES
FILE --> DTO
```

**图表来源**
- [main.rs:1-8](file://src-tauri/src/main.rs#L1-L8)
- [lib.rs:1-167](file://src-tauri/src/lib.rs#L1-L167)
- [cmd/mod.rs:1-10](file://src-tauri/src/cmd/mod.rs#L1-L10)
- [api_controller.rs:1-151](file://src-tauri/src/cmd/api_controller.rs#L1-L151)
- [auth_controller.rs:1-113](file://src-tauri/src/cmd/auth_controller.rs#L1-L113)
- [chat_record_controller.rs:1-80](file://src-tauri/src/cmd/chat_record_controller.rs#L1-L80)
- [chat_session_controller.rs:1-24](file://src-tauri/src/cmd/chat_session_controller.rs#L1-L24)
- [friend_controller.rs:1-41](file://src-tauri/src/cmd/friend_controller.rs#L1-L41)
- [notification_controller.rs:1-22](file://src-tauri/src/cmd/notification_controller.rs#L1-L22)
- [p2p_controller.rs:1-227](file://src-tauri/src/cmd/p2p_controller.rs#L1-L227)
- [file_controller.rs:1-200](file://src-tauri/src/cmd/file_controller.rs#L1-L200)
- [http_result.rs:1-10](file://src-tauri/src/dto/http_result.rs#L1-L10)
- [text_quic_msg.rs:1-47](file://src-tauri/src/vo/text_quic_msg.rs#L1-L47)
- [p2p_models.rs:1-394](file://src-tauri/src/entity/p2p_models.rs#L1-L394)
- [p2p_service.rs:1-914](file://src-tauri/src/service/p2p_service.rs#L1-L914)
- [message_types.rs:1-124](file://src-tauri/src/utils/message_types.rs#L1-L124)

**章节来源**
- [main.rs:1-8](file://src-tauri/src/main.rs#L1-L8)
- [lib.rs:1-167](file://src-tauri/src/lib.rs#L1-L167)
- [cmd/mod.rs:1-10](file://src-tauri/src/cmd/mod.rs#L1-L10)

## 核心组件
- Tauri命令注册器：在应用启动时将所有命令注册为前端可调用的invoke接口
- 控制器模块：按功能划分的命令实现，如API、认证、聊天、会话、好友、通知、P2P、文件
- DTO与VO：统一的HTTP响应结构与消息数据载体
- **文件传输模型：P2pFileData、P2pFileTransferRequest、P2pFileTransferResponse**
- **P2P通道系统：Default、MediaInfo、MediaData、File四种通道类型**
- 全局状态：用户信息、QUIC连接、SQL连接池、P2P发送通道等

**章节来源**
- [lib.rs:117-163](file://src-tauri/src/lib.rs#L117-L163)
- [http_result.rs:1-10](file://src-tauri/src/dto/http_result.rs#L1-L10)
- [text_quic_msg.rs:1-47](file://src-tauri/src/vo/text_quic_msg.rs#L1-L47)
- [p2p_models.rs:52-79](file://src-tauri/src/entity/p2p_models.rs#L52-L79)
- [p2p_models.rs:121-171](file://src-tauri/src/entity/p2p_models.rs#L121-L171)

## 架构总览
后端以Tauri为桥接，前端通过invoke调用Rust命令；命令内部可进行HTTP请求、数据库操作、P2P通信等。

```mermaid
sequenceDiagram
participant FE as "前端(PC/移动端)"
participant TAURI as "Tauri 命令注册器(lib.rs)"
participant CTRL as "控制器(如 p2p_controller.rs)"
participant SVC as "服务层(p2p_service.rs)"
participant CHANNEL as "P2P通道(File)"
participant TARGET as "目标用户"
FE->>TAURI : invoke("send_p2p_file_data", {file_data, target_uuid})
TAURI->>CTRL : 调用 send_p2p_file_data(file_data, target_uuid)
CTRL->>SVC : send_p2p_file_data_service(file_data, target_uuid)
SVC->>CHANNEL : 获取File通道发送器
CHANNEL->>TARGET : 发送文件分片数据
TARGET-->>CHANNEL : 确认接收
CHANNEL-->>SVC : 发送完成确认
SVC-->>CTRL : 返回成功
CTRL-->>TAURI : Result<(), String>
TAURI-->>FE : 返回结果
```

**图表来源**
- [lib.rs:117-163](file://src-tauri/src/lib.rs#L117-L163)
- [p2p_controller.rs:192-200](file://src-tauri/src/cmd/p2p_controller.rs#L192-L200)
- [p2p_service.rs:788-822](file://src-tauri/src/service/p2p_service.rs#L788-L822)

## 详细组件分析

### 认证与用户管理
- 登录(sign_in)
  - 方法：POST
  - URL：自定义后端登录地址
  - 请求体：账户凭据键值对
  - 成功后自动设置Authorization头并拉取用户信息
  - 返回：统一HTTP响应结构
- 登出(logout)
  - 清空用户信息、服务器列表、数据库连接
- 清除用户信息(clear_user_info)
  - 仅清理内存中的用户状态

```mermaid
sequenceDiagram
participant FE as "前端"
participant AUTH as "auth_controller.rs"
participant API as "api_controller.rs"
participant SRV as "后端服务"
participant GLOB as "全局状态(GLOBAL_QUIC_USER_INFO)"
FE->>AUTH : invoke("sign_in", {url, body})
AUTH->>SRV : POST 登录
SRV-->>AUTH : {code, data(token)}
AUTH->>GLOB : 写入 token/account
AUTH->>API : 调用 post_request("/user/me")
API-->>AUTH : 用户信息(JSON)
AUTH-->>FE : 返回登录结果(HttpResult)
```

**图表来源**
- [auth_controller.rs:16-64](file://src-tauri/src/cmd/auth_controller.rs#L16-L64)
- [api_controller.rs:35-58](file://src-tauri/src/cmd/api_controller.rs#L35-L58)

**章节来源**
- [auth_controller.rs:16-113](file://src-tauri/src/cmd/auth_controller.rs#L16-L113)

### HTTP请求封装
- get_request(url)
  - 方法：GET
  - 参数：url
  - 返回：ApiResponse(status, body)
- post_request(url, body)
  - 方法：POST
  - 自动注入Authorization头（来自全局token）
  - 返回：ApiResponse(status, body)
- 文件上传
  - upload_file_request / upload_file_with_extra_fields_request
  - upload_multiple_files_request / upload_multiple_files_with_extra_fields_request
  - post_form_data_request(fields)
- 图片压缩
  - compress_image_to_webp_command(input_path)

```mermaid
flowchart TD
Start(["调用 get_request"]) --> NewClient["创建HTTP客户端"]
NewClient --> SendGet["发送GET请求"]
SendGet --> AwaitResp["等待响应"]
AwaitResp --> BuildResp["提取状态码与Body"]
BuildResp --> Return["返回 ApiResponse"]
```

**图表来源**
- [api_controller.rs:24-33](file://src-tauri/src/cmd/api_controller.rs#L24-L33)

**章节来源**
- [api_controller.rs:1-151](file://src-tauri/src/cmd/api_controller.rs#L1-L151)

### 聊天记录与会话
- 发送文本消息(send_text_msg)
  - 参数：TextQuicMsgVo
  - 行为：带超时的全局互斥锁保护，避免并发写冲突
- 发送图片消息(send_image_msg)
  - 参数：TextQuicMsgVo
- 标记已读(mark_read)
  - 参数：消息ID数组
- 从本地存储查询聊天记录
  - get_chat_record_from_store
  - get_chat_record_by_type
- 会话管理
  - create_chat_session
  - get_chat_session_from_store
  - mark_read_chat_session

```mermaid
sequenceDiagram
participant FE as "前端"
participant CHAT as "chat_record_controller.rs"
participant SVC as "chat_service.rs"
participant DB as "chat_record_db.rs"
participant LOCK as "GLOBAL_MSG_SEND_LOCK"
FE->>CHAT : invoke("send_text_msg", TextQuicMsgVo)
CHAT->>LOCK : 10秒内尝试获取锁
alt 获取成功
CHAT->>SVC : send_text_msg_service
SVC->>DB : 写入/更新
DB-->>SVC : OK
SVC-->>CHAT : OK
CHAT-->>FE : "success"
else 获取失败/超时
CHAT-->>FE : 错误信息
end
```

**图表来源**
- [chat_record_controller.rs:16-37](file://src-tauri/src/cmd/chat_record_controller.rs#L16-L37)

**章节来源**
- [chat_record_controller.rs:1-80](file://src-tauri/src/cmd/chat_record_controller.rs#L1-L80)
- [chat_session_controller.rs:1-24](file://src-tauri/src/cmd/chat_session_controller.rs#L1-L24)
- [text_quic_msg.rs:1-47](file://src-tauri/src/vo/text_quic_msg.rs#L1-L47)

### 好友与系统通知
- 获取好友列表(get_friend_list)
- 获取好友信息(get_friend_info)
- 更新本地好友列表(update_local_friend_list)
- 删除好友(delete_friend_command)
- 获取系统通知(get_system_notification)
- 批量已读系统通知(batch_read_system_notification)

**章节来源**
- [friend_controller.rs:1-41](file://src-tauri/src/cmd/friend_controller.rs#L1-L41)
- [notification_controller.rs:1-22](file://src-tauri/src/cmd/notification_controller.rs#L1-L22)

### P2P与视频通话
- P2P初始化与UDP打洞
  - send_p2p_init_msg
  - send_init_p2p_udp
  - process_init_p2p_request
- 媒体与控制
  - send_p2p_video_config / send_p2p_media_config
  - send_p2p_media_control
  - send_p2p_video_frame / send_p2p_audio_frame
  - send_video_frame（本地缓存队列）
- 文本消息
  - send_p2p_text_msg
- 视频通话流程
  - send_p2p_video_call_invite
  - send_p2p_video_call_response
  - send_p2p_video_call_end
- 关闭连接
  - close_p2p_connection

```mermaid
sequenceDiagram
participant FE as "前端"
participant P2P as "p2p_controller.rs"
participant SVC as "p2p_service.rs"
participant QUIC as "QUIC/P2P通道"
participant UDP as "UDP Socket"
FE->>P2P : invoke("send_init_p2p_udp")
P2P->>UDP : 发送UDP探测
UDP-->>P2P : 返回本地可用端口
P2P-->>FE : "127.0.0.1 : <port>"
FE->>P2P : invoke("send_p2p_init_msg", 接收者UUID)
P2P->>SVC : 发送P2P初始化消息
SVC->>QUIC : 建立/维护P2P连接
QUIC-->>SVC : 连接就绪
SVC-->>FE : "success"
```

**图表来源**
- [p2p_controller.rs:16-55](file://src-tauri/src/cmd/p2p_controller.rs#L16-L55)

**章节来源**
- [p2p_controller.rs:1-170](file://src-tauri/src/cmd/p2p_controller.rs#L1-L170)

## 文件传输API

### 文件传输通道架构
系统为文件传输专门设计了独立的File通道，与音视频通道分离，确保大文件传输不影响实时通话质量。

```mermaid
graph LR
subgraph "P2P通道类型"
DEFAULT["Default<br/>信令、文本消息、控制命令"]
MEDIA_INFO["MediaInfo<br/>媒体状态信息"]
MEDIA_DATA["MediaData<br/>音视频数据"]
FILE["File<br/>文件传输专用通道"]
end
subgraph "文件传输流程"
REQ["文件传输请求"] --> ACCEPT["接收方确认"]
ACCEPT --> CHUNK["分片传输"]
CHUNK --> MERGE["文件合并"]
end
FILE -.-> REQ
FILE -.-> CHUNK
FILE -.-> MERGE
```

**图表来源**
- [p2p_models.rs:52-79](file://src-tauri/src/entity/p2p_models.rs#L52-L79)
- [message_types.rs:75-86](file://src-tauri/src/utils/message_types.rs#L75-L86)

### Tauri命令接口

#### 发送文件数据
- 命令名称：send_p2p_file_data
- 功能：通过File通道发送文件分片数据
- 参数：
  - file_data: String (P2pFileData结构的JSON字符串)
  - target_uuid: String (目标用户UUID)
- 返回：Result<(), String>
- 行为：文件被切分为多个分片，每个分片独立发送

#### 发送文件传输请求
- 命令名称：send_p2p_file_transfer_request
- 功能：在发送文件数据前，先发送请求等待对方确认
- 参数：
  - transfer_request: String (P2pFileTransferRequest结构的JSON字符串)
  - target_uuid: String (目标用户UUID)
- 返回：Result<(), String>
- 行为：发送握手消息等待接收方确认

#### 发送文件传输响应
- 命令名称：send_p2p_file_transfer_response
- 功能：对方收到文件传输请求后，通过此命令回复接受或拒绝
- 参数：
  - transfer_response: String (P2pFileTransferResponse结构的JSON字符串)
  - target_uuid: String (目标用户UUID)
- 返回：Result<(), String>
- 行为：对文件传输请求进行确认或拒绝

**章节来源**
- [p2p_controller.rs:186-226](file://src-tauri/src/cmd/p2p_controller.rs#L186-L226)
- [p2p_service.rs:775-913](file://src-tauri/src/service/p2p_service.rs#L775-L913)

### TypeScript接口定义

#### FileData接口
用于P2P文件传输中的单个分片数据：

| 字段名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| uuid | string | 文件唯一标识 | "123e4567-e89b-12d3-a456-426614174000" |
| file_name | string | 文件名 | "document.pdf" |
| mime_type | string | MIME类型 | "application/pdf" |
| total_size | number | 文件总大小 (字节) | 1048576 |
| chunk_index | number | 当前分片索引 (从0开始) | 5 |
| total_chunks | number | 总分片数 | 10 |
| chunk_data | string | Base64编码的分片数据 | "JVBERi0..." |
| transfer_id | string | 传输ID - 用于关联同一次文件传输的所有分片 | "transfer-123" |

#### FileTransferRequest接口
文件传输请求握手消息：

| 字段名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| transfer_id | string | 传输ID - 唯一标识一次文件传输 | "transfer-123" |
| file_name | string | 文件名 | "document.pdf" |
| total_size | number | 文件总大小 (字节) | 1048576 |
| mime_type | string | MIME类型 | "application/pdf" |
| chunk_size | number | 分片大小 (字节) | 104857 |
| total_chunks | number | 总分片数 | 10 |
| from_uuid | string | 请求者UUID | "sender-uuid" |
| to_uuid | string | 目标UUID | "receiver-uuid" |
| timestamp | number | 请求时间戳 | 1700000000000 |

#### FileTransferResponse接口
文件传输响应消息：

| 字段名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| transfer_id | string | 传输ID - 对应请求中的transfer_id | "transfer-123" |
| accept | boolean | 是否接受传输 | true |
| from_uuid | string | 响应者UUID | "receiver-uuid" |
| to_uuid | string | 目标UUID | "sender-uuid" |
| reject_reason | string | 拒绝原因 (拒绝时可选) | "文件过大" |
| timestamp | number | 响应时间戳 | 1700000000000 |

**章节来源**
- [index.ts (P2P类型):190-276](file://packages/types/src/p2p/index.ts#L190-L276)
- [p2p_models.rs:121-171](file://src-tauri/src/entity/p2p_models.rs#L121-L171)

### 文件传输工作流程

```mermaid
sequenceDiagram
participant SENDER as "发送方"
participant REQUEST_CMD as "send_p2p_file_transfer_request"
participant RECEIVER as "接收方"
participant RESPONSE_CMD as "send_p2p_file_transfer_response"
participant DATA_CMD as "send_p2p_file_data"
SENDER->>REQUEST_CMD : 发送文件传输请求
REQUEST_CMD->>RECEIVER : 发送请求消息
RECEIVER->>RESPONSE_CMD : 发送确认/拒绝响应
RESPONSE_CMD-->>SENDER : 返回确认结果
alt 接收方接受
loop 遍历所有分片
SENDER->>DATA_CMD : 发送下一个文件分片
DATA_CMD->>RECEIVER : 发送分片数据
RECEIVER-->>DATA_CMD : 确认接收
end
RECEIVER-->>SENDER : 传输完成通知
else 接收方拒绝
SENDER-->>SENDER : 中止传输
end
```

**图表来源**
- [p2p_service.rs:835-868](file://src-tauri/src/service/p2p_service.rs#L835-L868)
- [p2p_service.rs:881-913](file://src-tauri/src/service/p2p_service.rs#L881-L913)
- [p2p_service.rs:788-822](file://src-tauri/src/service/p2p_service.rs#L788-L822)

### P2P通道类型扩展
新增File通道类型，专门用于文件传输：

| 通道类型 | 用途 | 特点 |
|----------|------|------|
| Default | 信令、文本消息、控制命令 | 通用通道，承载各种控制消息 |
| MediaInfo | 媒体状态信息 | 传输分辨率变化、码率调整等控制信令 |
| MediaData | 音视频数据 | 专门传输视频帧和音频帧数据 |
| **File** | **文件传输** | **独立于音视频通道，避免大文件传输影响实时通话质量** |

**章节来源**
- [p2p_models.rs:52-79](file://src-tauri/src/entity/p2p_models.rs#L52-L79)
- [message_types.rs:75-86](file://src-tauri/src/utils/message_types.rs#L75-L86)

## 依赖关系分析
- 前端依赖
  - @tauri-apps/api：调用后端命令
  - 业务包：@workspace/services、@workspace/types
  - **新增：文件传输Hook接口**
- 后端依赖
  - reqwest：HTTP客户端
  - tokio/sqlx：异步运行时与数据库访问
  - quinn/rustls：QUIC/TLS加密通信
  - dashmap/lazy_static：全局共享状态
  - serde/serde_json：序列化/反序列化

```mermaid
graph LR
PC_PKG["@tauri-apps/api<br/>apps/pc/package.json"] --> LIB["lib.rs 注册命令"]
MOB_PKG["@tauri-apps/api<br/>apps/mobile/package.json"] --> LIB
LIB --> DEPS["reqwest / tokio / sqlx / quinn / rustls / serde"]
USE_P2P["useP2pMessageApi Hook"] --> TYPES["@workspace/types"]
TYPES --> P2P_TYPES["p2p/index.ts"]
```

**图表来源**
- [package.json (PC):18-32](file://apps/pc/package.json#L18-L32)
- [package.json (移动端):16-24](file://apps/mobile/package.json#L16-L24)
- [Cargo.toml:24-62](file://src-tauri/Cargo.toml#L24-L62)
- [useP2pMessageApi.ts:1-114](file://apps/pc/src/hooks/useP2pMessageApi.ts#L1-L114)

**章节来源**
- [Cargo.toml:1-62](file://src-tauri/Cargo.toml#L1-L62)
- [package.json (PC):1-45](file://apps/pc/package.json#L1-L45)
- [package.json (移动端):1-37](file://apps/mobile/package.json#L1-L37)

## 性能与并发特性
- 全局互斥锁：消息发送加锁，避免数据库写入竞争，超时10秒
- 异步运行时：Tokio全栈异步，提升I/O密集型任务吞吐
- 全局连接池：SQLite连接池按环境分离（通用/私有），减少连接开销
- QUIC通道：低延迟、高可靠，适合音视频与消息传输
- **文件传输优化：File通道独立，分片传输避免大块数据阻塞**
- 图片压缩：阻塞任务放入线程池，避免阻塞事件循环

**章节来源**
- [lib.rs:74-75](file://src-tauri/src/lib.rs#L74-L75)
- [chat_record_controller.rs:18-37](file://src-tauri/src/cmd/chat_record_controller.rs#L18-L37)
- [p2p_service.rs:788-822](file://src-tauri/src/service/p2p_service.rs#L788-L822)

## 故障排查与错误码
- 统一响应结构
  - code：整数状态码
  - data：任意JSON对象或字符串
  - message：描述信息
- 常见错误来源
  - HTTP请求失败：检查URL、网络、证书
  - 认证失败：确认token是否注入、是否过期
  - 数据库写入失败：检查连接池状态与表结构
  - P2P连接失败：检查UDP可达性、防火墙/NAT
  - **文件传输失败：检查File通道状态、分片完整性、传输ID一致性**
- 建议排查步骤
  - 查看后端日志（RUST_BACKTRACE=full）
  - 校验全局状态（token、服务器列表、连接池）
  - 分阶段测试：HTTP -> 数据库 -> P2P -> 文件传输

**章节来源**
- [http_result.rs:1-10](file://src-tauri/src/dto/http_result.rs#L1-L10)
- [lib.rs:86-89](file://src-tauri/src/lib.rs#L86-L89)

## 结论
本API参考文档梳理了后端REST API与前端Tauri命令接口，明确了认证、消息、好友、通知与P2P通信的调用方式与数据模型。**新增的文件传输API为应用提供了完整的文件分享能力，支持大文件分片传输、握手确认机制和独立的File通道，确保了实时通信与文件传输的性能平衡。**建议在生产环境中：
- 明确版本号与迁移策略
- 使用HTTPS与安全证书
- 实施重试与降级策略
- 加强日志与监控
- **合理设置分片大小，优化传输性能**

## 附录

### API版本管理与兼容性
- 版本号：后端包版本字段
- 建议
  - 语义化版本：主版本号变更表示不兼容升级
  - 迁移指南：在新版本中保留旧接口一段时间，逐步淘汰
  - 兼容性：保持请求/响应字段向后兼容，新增字段默认可选

**章节来源**
- [Cargo.toml:1-10](file://src-tauri/Cargo.toml#L1-L10)

### 前端调用约定
- 统一通过Tauri invoke调用后端命令
- 参数与返回值遵循各命令定义
- 错误处理：捕获字符串错误并提示用户
- **文件传输调用流程：先发送请求 -> 等待确认 -> 循环发送分片 -> 监听完成**

**章节来源**
- [lib.rs:117-163](file://src-tauri/src/lib.rs#L117-L163)
- [p2p_controller.rs:186-226](file://src-tauri/src/cmd/p2p_controller.rs#L186-L226)

### P2P事件监听
- 使用useP2pMessageApi Hook监听P2P相关事件
- 支持视频通话邀请、同意、拒绝等事件处理
- **文件传输事件：通过FileData、FileTransferRequest、FileTransferResponse接口处理**

**章节来源**
- [useP2pMessageApi.ts:1-114](file://apps/pc/src/hooks/useP2pMessageApi.ts#L1-L114)
- [index.ts (P2P类型):190-276](file://packages/types/src/p2p/index.ts#L190-L276)