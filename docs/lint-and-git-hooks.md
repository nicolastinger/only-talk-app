# 代码检查与推送保护钩子

本文说明客户端的 lint 配置、常用命令，以及 `pre-push` 推送保护钩子的行为。

## 一、检查命令

| 命令 | 内容 |
| --- | --- |
| `pnpm lint` | **格式化**（全仓库 `prettier --cache --write .`），不是检查 |
| `pnpm lint:pc` | apps/pc 检查：`max lint --eslint-only` + `max lint --stylelint-only` |
| `pnpm lint:mobile` | apps/mobile 检查：`eslint src --ext .ts,.vue` |
| `pnpm lint:web` | apps/web 检查：`eslint src --ext .ts,.vue` |
| `pnpm lint:fe` | 上面三个前端检查依次执行 |
| `pnpm lint:rust:fmt` | `cd src-tauri && cargo +nightly fmt --all --check` |
| `pnpm lint:rust:clippy` | `cd src-tauri && cargo +stable clippy --all-targets` |
| `pnpm lint:rust` | fmt + clippy |
| `pnpm --filter @workspace/<app> lint:fix` | 自动修复前端问题（app 取 `app-pc` / `app-mobile` / `app-web`） |

命令实现分别在根 `package.json` 与各 app 的 `package.json` 中，钩子脚本只是按需调用它们。

## 二、各工程 lint 配置

### apps/pc（Umi Max / React）

- ESLint：`apps/pc/.eslintrc.cjs` → `extends: require.resolve('@umijs/max/eslint')`
- Stylelint：`apps/pc/.stylelintrc.js` → `extends: require.resolve('@umijs/max/stylelint')`
- **配置文件必须是 `.cjs` 后缀**：`apps/pc/package.json` 声明了 `"type": "module"`，`.js` 会被当作 ESM 解析，`module.exports` 直接报错（ESLint 会以 `Cannot read config file` 终止）。

### apps/mobile、apps/web（Vue 3 + TS + Vite）

- 配置：各自目录下的 `.eslintrc.cjs`，基线为
  `eslint:recommended` + `plugin:vue/vue3-essential` + `plugin:@typescript-eslint/recommended`
- 解析器：`.vue` 用 `vue-eslint-parser`，其 `<script lang="ts">` 交给 `@typescript-eslint/parser`；`.ts` 直接用 `@typescript-eslint/parser`
- 额外约定（配置中有注释说明）：
  - `no-undef: off`：TypeScript 自己会检查未声明标识符，否则 `.vue` 里合法的 DOM 全局类型（如 `ScrollBehavior`）会误报
  - `vue/multi-word-component-names: off`：页面/组件按路由或目录命名（`index.vue`、`Plaza.vue` …），不强制多词组件名
  - `@typescript-eslint/no-unused-vars` 允许 `_` 前缀

## 三、pre-push 钩子

- 入口：`.husky/pre-push`（husky v9，纯 sh 脚本）
- 逻辑：`scripts/pre-push.mjs`
- 生效方式：根 `package.json` 的 `prepare: husky` 在 `pnpm install` 时写入 `.husky/_/` 并设置 `core.hooksPath=.husky/_`

### 检查范围按推送内容选择

| 改动的路径 | 触发的检查 |
| --- | --- |
| `apps/pc/**` | `pnpm lint:pc` |
| `apps/mobile/**` | `pnpm lint:mobile` |
| `apps/web/**` | `pnpm lint:web` |
| `packages/**`、根级配置（`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.json`、`typings.d.ts`、`.husky/**`、`scripts/pre-push.mjs`） | 三个前端全跑 |
| `src-tauri/**` | `pnpm lint:rust:fmt` → `pnpm lint:rust:clippy` |
| 新分支 / 浅克隆等**无法确定推送范围**的情况 | 全量检查（前端 + Rust） |

不涉及上述路径的推送（例如只改文档）会直接跳过，不做无谓等待。

### 跳过与注意事项

- 跳过全部检查：`git push --no-verify`、`SKIP_GIT_HOOKS=1 git push`、`HUSKY=0 git push`
- Rust 检查会编译 `src-tauri`，而 `tauri::generate_context!` 需要内嵌前端产物 `apps/pc/dist`；缺失时钩子会直接提示先执行 `pnpm build`，而不是抛出难懂的编译错误
- clippy 与 CI 保持一致：不加 `-D warnings`（`serde_json::json!` 宏内部的 `unwrap` 会命中 `disallowed-methods`，属既有噪音）

## 四、依赖锁定注意（容易踩的坑）

根 `package.json` 中有：

```json
"pnpm": { "overrides": { "table>ajv": "8.17.1" } }
```

原因：`ajv` 从 8.18 起收紧 `package.json` 的 `exports`，而 stylelint 14（经 `table`）会 `require('ajv/dist/runtime/equal')`，升级后 stylelint CLI 直接以
`Error: Cannot find module 'ajv/dist/runtime/equal'` 崩溃（`pnpm lint:pc` 的 stylelint 部分会失效）。
锁定 `table` 的 `ajv` 为 8.17.1 即可，其它依赖（如 `schema-utils`）不受影响。若要移除该覆盖，请先确认 stylelint CLI 仍能正常运行。
