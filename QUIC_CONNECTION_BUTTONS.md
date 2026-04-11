# QUIC连接控制按钮功能说明

## 功能概述

为前端应用添加了两个新的控制按钮，用于管理QUIC连接状态：

1. **断开连接按钮** - 清理和服务器连接的QUIC资源
2. **重新连接按钮** - 重新建立和服务器连接的QUIC资源

## 使用方式

### 位置
两个按钮位于应用主界面的右上角工具栏中，当鼠标悬停在在线状态开关上时会显示。

### 按钮说明

#### 1. 断开QUIC连接（DisconnectOutlined图标）
- **功能**: 断开当前所有QUIC连接，清理相关资源
- **操作**: 点击后会：
  - 清理QUIC服务器连接列表（GLOBAL_QUIC_SERVER_LIST）
  - 标记用户离线状态（quic_disconnected = true）
  - 停止心跳发送
- **反馈**: 操作成功后显示"QUIC连接已断开"提示

#### 2. 重新连接QUIC（ReloadOutlined图标）
- **功能**: 重新建立与服务器的QUIC连接
- **操作**: 点击后会：
  - 先断开现有连接（调用disconnect_quic）
  - 清除断开状态标记（quic_disconnected = false）
  - 重新启动QUIC客户端连接
- **反馈**: 操作成功后显示"QUIC重连请求已发送"提示

## 技术实现

### 后端（Rust/Tauri）

#### 新增服务函数
文件: `frontend/src-tauri/src/service/user_service.rs`

```rust
// 断开QUIC连接
pub async fn disconnect_quic() -> Result<(), anyhow::Error>

// 重新连接QUIC服务
pub async fn reconnect_quic() -> Result<(), anyhow::Error>
```

#### 新增Tauri命令
文件: `frontend/src-tauri/src/cmd/user_controller.rs`

```rust
// 断开QUIC连接命令
#[tauri::command]
pub async fn disconnect_quic_command() -> Result<String, String>

// 重新连接QUIC服务命令
#[tauri::command]
pub async fn reconnect_quic_command() -> Result<String, String>
```

### 前端（React/TypeScript）

#### 新增组件
- `QuicDisconnectButton.tsx` - 断开连接按钮组件
- `QuicReconnectButton.tsx` - 重新连接按钮组件
- 对应的样式文件 `.less`

#### 组件集成
文件: `frontend/apps/pc/src/layouts/HomeLayout/index.tsx`

按钮被添加到工具栏的悬停菜单中，与其他工具按钮（主题切换、语言切换等）保持一致的UI风格。

## 注意事项

1. **断开连接后**: 
   - 将无法接收服务器推送的消息
   - P2P连接也会受到影响
   - 需要手动点击重连按钮恢复连接

2. **重连过程**:
   - 重连是异步操作，在后台进行
   - 如果重连失败，会在日志中记录错误信息
   - 建议在网络稳定时进行重连操作

3. **状态管理**:
   - 连接状态通过 `GLOBAL_QUIC_USER_INFO` 中的 `quic_disconnected` 字段管理
   - 可以通过Tauri命令 `get_user_map` 查询当前状态

## 测试建议

1. 正常连接状态下点击断开按钮，验证连接是否正常断开
2. 断开后尝试发送消息，验证是否无法通信
3. 点击重连按钮，验证是否能重新建立连接
4. 重连后验证消息收发是否正常
5. 在网络不稳定时测试重连功能

## 相关文件

### 后端文件
- `frontend/src-tauri/src/service/user_service.rs` - 服务实现
- `frontend/src-tauri/src/cmd/user_controller.rs` - 控制器命令
- `frontend/src-tauri/src/lib.rs` - 命令注册

### 前端文件
- `frontend/apps/pc/src/components/ToolButtons/QuicDisconnectButton.tsx` - 断开按钮组件
- `frontend/apps/pc/src/components/ToolButtons/QuicReconnectButton.tsx` - 重连按钮组件
- `frontend/apps/pc/src/components/ToolButtons/index.ts` - 组件导出
- `frontend/apps/pc/src/layouts/HomeLayout/index.tsx` - 按钮集成
