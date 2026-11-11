# OnlyTalk Desktop (Vue 3)

PC 桌面端前端，使用 Vue 3 + Vite + Ant Design Vue + Less + TypeScript。

## 开发

```bash
# 仅启动前端开发服务器（端口 8080）
pnpm dev

# 启动 Tauri 桌面应用开发模式
pnpm tauri dev

# 类型检查
pnpm typecheck

# 构建
pnpm build

# ESLint
pnpm lint
```

## 目录

```text
src/
├── components/          # 公共组件
├── layouts/             # RootLayout / HomeLayout / 各业务布局
├── pages/               # 页面（Home、Sign、Media、Privacy、WebRTC 等）
├── router/              # Vue Router 路由
├── stores/              # reactive 单例状态（与移动端一致）
├── i18n/                # @workspace/i18n 的 Vue 封装
├── hooks/               # composables
├── services/webrtcService/  # WebRTC 服务（纯 TS）
├── utils/               # 工具函数
├── theme/               # 亮/暗主题 CSS 变量
└── global.less          # 全局样式
```

## 约定

- 组件使用 `<script setup lang="ts">`。
- 样式使用 CSS Modules：`import styles from './index.module.less'`。
- 国际化：`const { t } = useI18n()`，模板中直接 `t('key')`。
- 全局反馈：`feedback.message` / `feedback.modal`（来自 `@/utils/feedback`）。
- 全局状态：`const store = useBearStore()`，直接访问 `store.userInfo` 等字段。
- 路由：`useRouter()` / `useRoute()`，路径与旧版 Umi 保持一致。
