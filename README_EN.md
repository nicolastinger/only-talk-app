# OnlyTalk App

> Cross-platform Instant Messaging Client — React + Tauri + Vue3 + P2P + WebRTC

[中文版本](README.md)

## Project Overview

OnlyTalk App is a cross-platform instant messaging client that supports desktop (Windows/macOS/Linux) and mobile platforms. The desktop version is built with React + Tauri, while the mobile version uses Vue3 + Vant, providing features such as real-time chat, P2P communication, and video calls.

## Tech Stack

### Desktop (PC)

| Component | Technology | Description |
|------|------|------|
| Frontend Framework | Umi Max (React 18) | Enterprise-level frontend framework |
| UI Component Library | Ant Design 5.x | Enterprise-level UI design language |
| State Management | Zustand 5.x | Lightweight state management |
| Desktop Framework | Tauri 2.0 | Rust-powered cross-platform desktop app |
| Markdown Rendering | react-markdown | Markdown rendering |
| Styling | Less | CSS preprocessor |

### Mobile

| Component | Technology | Description |
|------|------|------|
| Frontend Framework | Vue 3 | Progressive JavaScript framework |
| UI Component Library | Vant | Mobile Vue component library |
| Build Tool | Vite | Next-generation frontend build tool |
| Styling | Less | CSS preprocessor |

### Shared Modules

| Module | Description |
|------|------|
| @workspace/types | TypeScript type definitions |
| @workspace/services | API service encapsulation (user, group, file, notification, etc.) |

## Project Structure

```
only-talk-app/
├── apps/
│   ├── pc/                      # Desktop application
│   │   ├── src/
│   │   │   ├── components/      # Common components
│   │   │   ├── pages/           # Page components
│   │   │   │   ├── Home/        # Home (chat, contacts, settings)
│   │   │   │   ├── Sign/        # Sign in/up
│   │   │   │   ├── Media/       # Media handling (video call)
│   │   │   │   ├── Privacy/     # Privacy mode
│   │   │   │   └── WebRTC/      # WebRTC communication
│   │   │   ├── layouts/         # Layout components
│   │   │   ├── locales/         # Internationalization (zh-CN, en-US, zh-TW)
│   │   │   ├── models/          # Data models
│   │   │   ├── services/        # WebRTC service
│   │   │   ├── hooks/          # Custom hooks
│   │   │   └── utils/          # Utility functions
│   │   ├── .umirc.ts           # Umi configuration
│   │   └── package.json
│   └── mobile/                 # Mobile application
│       ├── src/
│       │   ├── components/     # Common components
│       │   ├── pages/          # Page components
│       │   │   ├── Chats/      # Chats
│       │   │   ├── Friends/    # Friends
│       │   │   ├── Moments/    # Moments
│       │   │   ├── Profile/    # Profile
│       │   │   └── Discover/   # Discover
│       │   ├── stores/         # State management
│       │   └── utils/          # Utility functions
│       └── vite.config.ts      # Vite configuration
├── packages/
│   ├── services/               # Shared service modules
│   │   └── src/
│   │       ├── userService/    # User service
│   │       ├── groupService/   # Group service
│   │       ├── fileService/    # File service
│   │       ├── httpService/    # HTTP service
│   │       └── notificationService/ # Notification service
│   └── types/                  # Shared type definitions
├── package.json                # Monorepo root configuration
└── pnpm-workspace.yaml        # pnpm workspace configuration
```

## Quick Start

### Prerequisites

- **Node.js**: >= 16.x (LTS version recommended)
- **pnpm**: >= 8.0.0
- **Rust**: >= 1.70 (for desktop build)
- **Operating System**:
  - Desktop development: Windows 10+/macOS 10.14+/Linux
  - Mobile development: Any system supporting Node.js

#### Windows Specific Requirements

- WebView2 (Windows 10+/11)
- Microsoft Visual Studio C++ Build Tools (for Rust compilation)

### 1. Clone the Project

```bash
git clone <repository-url>
cd only-talk-app
```

### 2. Install Dependencies

```bash
# Install dependencies using pnpm
pnpm install
```

### 3. Local Development

#### Desktop Development

```bash
# Start frontend development server
pnpm dev

# Start Tauri desktop app development mode
pnpm tauri dev
```

After starting, the default frontend address: http://localhost:8000

#### Mobile Development

```bash
# Start mobile development server
pnpm dev:mobile
```

### 4. Build and Deploy

```bash
# Build desktop frontend production version
pnpm build

# Build mobile production version
pnpm build:mobile

# Build all applications
pnpm build:all

# Build Tauri desktop application
pnpm tauri build
```

Build outputs:
- Web frontend: `apps/pc/dist`
- Mobile: `apps/mobile/dist`
- Desktop application: `apps/pc/src-tauri/target/release`

### 5. Other Common Commands

```bash
# Code formatting
pnpm lint

# Build types package
pnpm build:types

# Build services package
pnpm build:services
```

## Features

### Instant Messaging

- One-on-one and group chat
- Text, image, and file messages
- Message history
- Read receipts

### P2P Communication

- QUIC protocol real-time communication
- P2P hole punching and NAT traversal
- Privacy mode chat
- End-to-end encryption

### Multimedia

- WebRTC video calls
- Image preview and compression
- File upload and download
- Audio and video processing

### User Management

- User registration and login
- Friend management
- Group creation and management
- Profile editing

### Internationalization

- Simplified Chinese (zh-CN)
- Traditional Chinese (zh-TW)
- English (en-US)

### Themes

- Light theme
- Dark theme
- Theme switching

## Development Guide

### Monorepo Structure

The project uses pnpm workspace to manage the monorepo, including:

- **apps/pc**: Desktop application
- **apps/mobile**: Mobile application
- **packages/services**: Shared API services
- **packages/types**: Shared type definitions

### Adding Pages

#### Desktop

1. Create a page directory under `apps/pc/src/pages/`
2. Create page component (`.tsx`) and style file (`.less`)
3. Configure route in `apps/pc/src/route/index.ts`

#### Mobile

1. Create a page directory under `apps/mobile/src/pages/`
2. Create page component (`.vue`)
3. Configure route in `apps/mobile/src/router/index.ts`

### Adding Shared Services

1. Create service module under `packages/services/src/`
2. Export in `packages/services/src/index.ts`
3. Import via `@workspace/services` in applications

### Adding Shared Types

1. Define TypeScript types in `packages/types/`
2. Run `pnpm build:types` to build
3. Import via `@workspace/types` in applications

### Code Standards

- Use Prettier for code formatting
- Use Husky + lint-staged for pre-commit checks
- TypeScript strict mode

## Documentation Resources

- [Umi Max Documentation](https://umijs.org/docs/max/introduce)
- [Tauri Documentation](https://tauri.app/)
- [Ant Design Components](https://ant.design/)
- [Vue 3 Documentation](https://vuejs.org/)
- [Vant Components](https://vant-ui.github.io/vant/)

## License

[LICENSE](LICENSE)