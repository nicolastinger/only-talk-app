# OnlyTalk App

> 跨平台即时通讯客户端 — React + Tauri + Vue3 + P2P + WebRTC

[English Version](README_EN.md)

## 项目简介

OnlyTalk App 是一个跨平台即时通讯客户端，支持桌面端（Windows/macOS/Linux）和移动端。桌面端采用 React + Tauri 构建，移动端采用 Vue3 + Vant 开发，提供实时聊天、P2P 通信、视频通话等功能。

## 技术栈

### 桌面端（PC）

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Umi Max (React 18) | 企业级前端框架 |
| UI 组件库 | Ant Design 5.x | 企业级 UI 设计语言 |
| 状态管理 | Zustand 5.x | 轻量级状态管理 |
| 桌面框架 | Tauri 2.0 | Rust 驱动的跨平台桌面应用 |
| 标记语言 | react-markdown | Markdown 渲染 |
| 样式方案 | Less | CSS 预处理器 |

### 移动端（Mobile）

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 | 渐进式 JavaScript 框架 |
| UI 组件库 | Vant | 移动端 Vue 组件库 |
| 构建工具 | Vite | 下一代前端构建工具 |
| 样式方案 | Less | CSS 预处理器 |

### 共享模块

| 模块 | 说明 |
|------|------|
| @workspace/types | TypeScript 类型定义 |
| @workspace/services | API 服务封装（用户、群组、文件、通知等） |

## 项目结构

```
only-talk-app/
├── apps/
│   ├── pc/                      # 桌面端应用
│   │   ├── src/
│   │   │   ├── components/      # 公共组件
│   │   │   ├── pages/           # 页面组件
│   │   │   │   ├── Home/        # 主页（聊天、联系人、设置）
│   │   │   │   ├── Sign/        # 登录注册
│   │   │   │   ├── Media/        # 媒体处理（视频通话）
│   │   │   │   ├── Privacy/     # 隐私模式
│   │   │   │   └── WebRTC/      # WebRTC 通信
│   │   │   ├── layouts/         # 布局组件
│   │   │   ├── locales/         # 国际化（zh-CN, en-US, zh-TW）
│   │   │   ├── models/          # 数据模型
│   │   │   ├── services/        # WebRTC 服务
│   │   │   ├── hooks/          # 自定义 Hooks
│   │   │   └── utils/          # 工具函数
│   │   ├── .umirc.ts           # Umi 配置
│   │   └── package.json
│   └── mobile/                 # 移动端应用
│       ├── src/
│       │   ├── components/     # 公共组件
│       │   ├── pages/          # 页面组件
│       │   │   ├── Chats/      # 聊天
│       │   │   ├── Friends/    # 好友
│       │   │   ├── Moments/    # 动态
│       │   │   ├── Profile/    # 个人中心
│       │   │   └── Discover/   # 发现
│       │   ├── stores/         # 状态管理
│       │   └── utils/          # 工具函数
│       └── vite.config.ts      # Vite 配置
├── packages/
│   ├── services/               # 共享服务模块
│   │   └── src/
│   │       ├── userService/    # 用户服务
│   │       ├── groupService/   # 群组服务
│   │       ├── fileService/    # 文件服务
│   │       ├── httpService/    # HTTP 服务
│   │       └── notificationService/ # 通知服务
│   └── types/                  # 共享类型定义
├── package.json                # Monorepo 根配置
└── pnpm-workspace.yaml        # pnpm workspace 配置
```

## 快速开始

### 前置要求

- **Node.js**: >= 16.x (推荐使用 LTS 版本)
- **pnpm**: >= 8.0.0
- **Rust**: >= 1.70 (桌面端构建)
- **操作系统**:
  - 桌面端开发：Windows 10+/macOS 10.14+/Linux
  - 移动端开发：任意支持 Node.js 的系统

#### Windows 特别要求

- WebView2 (Windows 10+/11)
- Microsoft Visual Studio C++ Build Tools (Rust 编译)

### 1. 克隆项目

```bash
git clone <repository-url>
cd only-talk-app
```

### 2. 安装依赖

```bash
# 使用 pnpm 安装依赖
pnpm install
```

### 3. 本地开发

#### 桌面端开发

```bash
# 启动前端开发服务器
pnpm dev

# 启动 Tauri 桌面应用开发模式
pnpm tauri dev
```

启动后，前端默认访问地址: http://localhost:8000

#### 移动端开发

```bash
# 启动移动端开发服务器
pnpm dev:mobile
```

### 4. 构建部署

```bash
# 构建桌面端前端生产版本
pnpm build

# 构建移动端生产版本
pnpm build:mobile

# 构建所有应用
pnpm build:all

# 构建 Tauri 桌面应用
pnpm tauri build
```

构建产物：
- Web 前端：`apps/pc/dist`
- 移动端：`apps/mobile/dist`
- 桌面应用：`apps/pc/src-tauri/target/release`

### 5. 其他常用命令

```bash
# 代码格式化
pnpm lint

# 构建 types 包
pnpm build:types

# 构建 services 包
pnpm build:services
```

## 功能特性

### 即时通讯

- 单聊、群聊消息
- 文本、图片、文件消息
- 消息历史记录
- 消息已读回执

### P2P 通信

- QUIC 协议实时通信
- P2P 打洞与 NAT 穿透
- 隐私模式聊天
- 端到端加密

### 多媒体

- WebRTC 视频通话
- 图片预览与压缩
- 文件上传下载
- 音视频处理

### 用户管理

- 用户注册登录
- 好友管理
- 群组创建与管理
- 个人资料编辑

### 国际化

- 简体中文（zh-CN）
- 繁体中文（zh-TW）
- 英文（en-US）

### 主题

- 亮色主题
- 暗色主题
- 主题切换

## 开发指南

### Monorepo 结构

项目采用 pnpm workspace 管理 monorepo，包含：

- **apps/pc**: 桌面端应用
- **apps/mobile**: 移动端应用
- **packages/services**: 共享 API 服务
- **packages/types**: 共享类型定义

### 新增页面

#### 桌面端

1. 在 `apps/pc/src/pages/` 下创建页面目录
2. 创建页面组件（`.tsx`）和样式文件（`.less`）
3. 在 `apps/pc/src/route/index.ts` 中配置路由

#### 移动端

1. 在 `apps/mobile/src/pages/` 下创建页面目录
2. 创建页面组件（`.vue`）
3. 在 `apps/mobile/src/router/index.ts` 中配置路由

### 新增共享服务

1. 在 `packages/services/src/` 下创建服务模块
2. 在 `packages/services/src/index.ts` 中导出
3. 在应用中通过 `@workspace/services` 引用

### 新增共享类型

1. 在 `packages/types/` 下定义 TypeScript 类型
2. 运行 `pnpm build:types` 构建
3. 在应用中通过 `@workspace/types` 引用

### 代码规范

- 使用 Prettier 格码格式化
- 使用 Husky + lint-staged 进行提交前检查
- TypeScript 严格模式

## 文档资源

- [Umi Max 官方文档](https://umijs.org/docs/max/introduce)
- [Tauri 官方文档](https://tauri.app/)
- [Ant Design 组件库](https://ant.design/)
- [Vue 3 官方文档](https://vuejs.org/)
- [Vant 组件库](https://vant-ui.github.io/vant/)

## License

[LICENSE](LICENSE)