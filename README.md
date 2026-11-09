# OnlyTalk App

> 跨平台即时通讯客户端 — Vue3 + Tauri + P2P + WebRTC

[English Version](README_EN.md)

## 项目简介

OnlyTalk App 是一个跨平台即时通讯客户端，支持桌面端（Windows/macOS/Linux）和移动端。桌面端与移动端均采用 Vue3 开发，提供实时聊天、P2P 通信、视频通话等功能。

> 桌面端当前版本位于 `apps/desktop`（Vue3 + Vite + Ant Design Vue）。`apps/pc` 为旧版 React/Umi 实现，保留作回退参考，不再是 Tauri 默认前端。

## 技术栈

### 桌面端（Desktop）

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 | 渐进式 JavaScript 框架 |
| UI 组件库 | Ant Design Vue 4.x | 企业级 UI 设计语言 |
| 构建工具 | Vite 5 | 下一代前端构建工具 |
| 状态管理 | Vue reactive stores | 与移动端一致的轻量单例状态 |
| 桌面框架 | Tauri 2.0 | Rust 驱动的跨平台桌面应用 |
| 标记语言 | marked + DOMPurify | Markdown 渲染与安全过滤 |
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
│   ├── desktop/                # 桌面端应用（Vue3 + Vite）
│   │   ├── src/
│   │   │   ├── components/      # 公共组件
│   │   │   ├── pages/           # 页面组件
│   │   │   │   ├── Home/        # 主页（聊天、联系人、设置）
│   │   │   │   ├── Sign/        # 登录注册
│   │   │   │   ├── Media/       # 媒体处理（视频通话）
│   │   │   │   ├── Privacy/     # 隐私模式
│   │   │   │   └── WebRTC/      # WebRTC 通信
│   │   │   ├── layouts/         # 布局组件
│   │   │   ├── router/          # Vue Router 路由
│   │   │   ├── stores/          # 状态管理
│   │   │   ├── i18n/            # 国际化封装
│   │   │   ├── services/        # WebRTC 服务
│   │   │   ├── hooks/           # 自定义 composables
│   │   │   └── utils/           # 工具函数
│   │   ├── vite.config.ts       # Vite 配置
│   │   └── package.json
│   ├── pc/                      # 旧版 React/Umi 桌面端（legacy）
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

启动后，前端默认访问地址: http://localhost:8080

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
- 桌面端前端：`apps/desktop/dist`
- 移动端：`apps/mobile/dist`
- 桌面应用：`src-tauri/target/release`

### 5. 其他常用命令

```bash
# 代码格式化（全仓库 prettier --write）
pnpm lint

# 各端代码检查（只检查、不修改）
pnpm lint:fe        # = lint:desktop + lint:pc + lint:mobile + lint:web
pnpm lint:desktop   # apps/desktop eslint
pnpm lint:pc        # apps/pc      eslint + stylelint（legacy）
pnpm lint:mobile    # apps/mobile  eslint
pnpm lint:web       # apps/web     eslint

# src-tauri 检查
pnpm lint:rust      # = lint:rust:fmt + lint:rust:clippy
pnpm lint:rust:fmt  # cargo +nightly fmt --all --check
pnpm lint:rust:clippy

# 自动修复前端问题
pnpm --filter @workspace/app-desktop lint:fix
pnpm --filter @workspace/app-pc lint:fix
pnpm --filter @workspace/app-mobile lint:fix
pnpm --filter @workspace/app-web lint:fix

# 构建 types 包
pnpm build:types

# 构建 services 包
pnpm build:services
```

> 推送前 Git 钩子会自动执行对应端的 lint / fmt / clippy，详见 [docs/lint-and-git-hooks.md](docs/lint-and-git-hooks.md)。

## 本地运行环境与数据目录

客户端的本地数据与资源目录会按 **运行环境（`{env}`）** 隔离，避免 dev / test / prod 数据互相干扰。

目录结构（`Documents/OnlyTalk/{env}/...`，桌面端为范例）：

```
Documents/OnlyTalk/{env}/
├── dbData/          # 本地数据库（user.db / common.db / private.db）
├── resource/        # 本地资源文件
│   └── YYYY-MM/     # 按月分目录的资源
└── logs/            # 日志
```

- 运行环境通过环境变量 **`ONLY_TALK_ENV`** 指定
- 未设置时默认 **`prod`**（即路径为 `Documents/OnlyTalk/prod/...`）

设置示例：

```bash
# PowerShell (Windows)
$env:ONLY_TALK_ENV="dev"
pnpm tauri dev

# bash (macOS/Linux)
export ONLY_TALK_ENV="dev"
pnpm tauri dev
```

> 注：不同环境的数据彼此隔离，切换环境不会自动迁移旧目录数据。

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

- **apps/desktop**: 桌面端应用（Vue3 + Vite，Tauri 默认前端）
- **apps/pc**: 旧版 React/Umi 桌面端（legacy）
- **apps/mobile**: 移动端应用
- **packages/services**: 共享 API 服务
- **packages/types**: 共享类型定义

### 新增页面

#### 桌面端

1. 在 `apps/desktop/src/pages/` 下创建页面目录
2. 创建页面组件（`.vue`）和样式文件（`.module.less`）
3. 在 `apps/desktop/src/router/index.ts` 中配置路由

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

- 使用 Prettier 进行代码格式化（`pnpm lint` 为全仓库 `prettier --write`）
- 使用 ESLint 做静态检查：apps/desktop / apps/mobile / apps/web 走 `eslint:recommended + plugin:vue/vue3-essential + @typescript-eslint/recommended`；apps/pc（legacy）走 Umi Max 预设（含 stylelint）
- src-tauri 使用 `cargo +nightly fmt`（rustfmt.toml 含 nightly 专属选项）与 `cargo clippy` 检查
- Husky 推送前钩子（pre-push）按改动范围自动跑上述检查，见 [docs/lint-and-git-hooks.md](docs/lint-and-git-hooks.md)
- TypeScript 严格模式

## 文档资源

- [Vue 3 官方文档](https://vuejs.org/)
- [Vite 官方文档](https://vitejs.dev/)
- [Ant Design Vue](https://antdv.com/)
- [Tauri 官方文档](https://tauri.app/)
- [Vant 组件库](https://vant-ui.github.io/vant/)

## License

[LICENSE](LICENSE)