# OnlyTalk App

> Cross-platform Instant Messaging Client — Vue3 + Tauri + P2P + WebRTC

[中文版本](README.md)

## Project Overview

OnlyTalk App is a cross-platform instant messaging client that supports desktop (Windows/macOS/Linux) and mobile platforms. Both desktop and mobile are built with Vue3, providing features such as real-time chat, P2P communication, and video calls.

> The desktop app lives in `apps/desktop` (Vue3 + Vite + Ant Design Vue) and is the default Tauri frontend.

## Tech Stack

### Desktop

| Component | Technology | Description |
|------|------|------|
| Frontend Framework | Vue 3 | Progressive JavaScript framework |
| UI Component Library | Ant Design Vue 4.x | Enterprise-level UI design language |
| Build Tool | Vite 5 | Next-generation frontend build tool |
| State Management | Vue reactive stores | Lightweight singleton stores aligned with mobile |
| Desktop Framework | Tauri 2.0 | Rust-powered cross-platform desktop app |
| Markdown Rendering | marked + DOMPurify | Markdown rendering and sanitization |
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
│   ├── desktop/                # Desktop application (Vue3 + Vite)
│   │   ├── src/
│   │   │   ├── components/      # Common components
│   │   │   ├── pages/           # Page components
│   │   │   │   ├── Home/        # Home (chat, contacts, settings)
│   │   │   │   ├── Sign/        # Sign in/up
│   │   │   │   ├── Media/       # Media handling (video call)
│   │   │   │   ├── Privacy/     # Privacy mode
│   │   │   │   └── WebRTC/      # WebRTC communication
│   │   │   ├── layouts/         # Layout components
│   │   │   ├── router/          # Vue Router routes
│   │   │   ├── stores/          # State management
│   │   │   ├── i18n/            # i18n wrapper
│   │   │   ├── services/        # WebRTC service
│   │   │   ├── hooks/           # Composables
│   │   │   └── utils/           # Utility functions
│   │   ├── vite.config.ts       # Vite configuration
│   │   └── package.json
│   ├── pc/                      # Legacy React/Umi desktop app
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

After starting, the default frontend address: http://localhost:8080

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
- Desktop frontend: `apps/desktop/dist`
- Mobile: `apps/mobile/dist`
- Desktop application: `src-tauri/target/release`

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

- **apps/desktop**: Desktop application (Vue3 + Vite, default Tauri frontend)
- **apps/mobile**: Mobile application
- **packages/services**: Shared API services
- **packages/types**: Shared type definitions

### Adding Pages

#### Desktop

1. Create a page directory under `apps/desktop/src/pages/`
2. Create page component (`.vue`) and style file (`.module.less`)
3. Configure route in `apps/desktop/src/router/index.ts`

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

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Ant Design Vue](https://antdv.com/)
- [Tauri Documentation](https://tauri.app/)
- [Vant Components](https://vant-ui.github.io/vant/)

## License

[LICENSE](LICENSE)