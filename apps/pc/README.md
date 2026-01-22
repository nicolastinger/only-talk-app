# README

## 项目介绍

这是一个基于 `@umijs/max` 和 Tauri 的桌面端应用项目，结合了前端 React 技术栈和 Rust 后端能力。该项目实现了聊天、媒体处理、P2P 通信等功能。

主要技术栈：

- 前端框架：Umi Max (基于 React)
- UI 组件库：Ant Design
- 状态管理：Zustand
- 包管理器：pnpm
- 桌面端框架：Tauri (集成 Rust 后端)
- 标记语言渲染：react-markdown

## 环境要求

在开始开发之前，请确保你的开发环境满足以下要求：

- **Node.js**: >= 14.x (推荐使用 LTS 版本)
- **pnpm**: >= 7.x
- **Rust**: >= 1.70 (通过 rustup 安装)
- **操作系统**:
  - Windows 10+/macOS 10.14+/Linux (前端开发)
  - Windows 10+ (Tauri 桌面应用构建)

### Windows 特别要求

- WebView2 (Windows 10+/11)
- Microsoft Visual Studio C++ Build Tools (用于 Rust 编译)

## 快速开始

### 安装依赖

```bash
# 使用 pnpm 安装前端依赖
pnpm install
```

### 本地开发

```bash
# 启动前端开发服务器
pnpm dev
```

启动后，默认访问地址为: http://localhost:8000

### Tauri 桌面应用开发

```bash
# 启动 Tauri 开发模式
pnpm tauri dev
```

### 构建部署

```bash
# 构建前端生产版本
pnpm build

# 构建 Tauri 桌面应用
pnpm tauri build
```

构建产物默认生成在 `dist` 目录中（Web）和 `src-tauri/target/release`（桌面应用）。

### 其他常用命令

```bash
# 代码格式化
pnpm format
```

## 项目结构

```
.
├── src                  # 前端源代码目录
│   ├── pages            # 页面组件
│   ├── components       # 公共组件
│   ├── layouts          # 布局组件
│   ├── services         # API 服务
│   ├── models           # 状态管理
│   └── utils            # 工具函数
├── src-tauri            # Tauri Rust 后端代码
│   ├── src              # Rust 源代码
│   ├── Cargo.toml       # Rust 依赖配置
│   └── tauri.conf.json  # Tauri 配置文件
├── .umirc.ts            # Umi 配置文件
└── package.json         # 项目依赖和脚本
```

## 文档资源

- [Umi Max 官方文档](https://umijs.org/docs/max/introduce)
- [Tauri 官方文档](https://tauri.app/)
- [Ant Design 组件库](https://ant.design/)
