# Only Talk 官网（apps/web）

纯前端 SPA 官网，Vue3 + TypeScript + Vite，与桌面端 / 移动端客户端分离，**不引入任何 Tauri 相关依赖**，也**不引用 `@workspace/services` / `@workspace/types`**（这两个共享包内部依赖 `@tauri-apps/*`）。构建产物由 nginx 静态托管。

## 页面

| 路由         | 说明                                 |
| ------------ | ------------------------------------ |
| `/`          | 首页（Hero / 特性 / CTA）            |
| `/download`  | 下载发布页（各平台客户端安装包）     |
| `/privacy`   | 隐私协议（占位骨架，正文待补充）     |
| `/agreement` | 用户使用协议（占位骨架，正文待补充） |

## 开发

```bash
pnpm --filter @workspace/app-web dev      # http://localhost:5180（strictPort）
```

## 构建

```bash
pnpm --filter @workspace/app-web build    # 内置 vue-tsc 类型检查，产物在 dist/
```

## 下载配置

下载入口统一维护在 `src/config/downloads.ts`（单一数据源）。当前全部为占位符：

- `localUrl` 指向 nginx `/downloads/` 目录（真实安装包放入 `public/downloads/` 或服务器同名目录）
- `releaseUrl` 指向 GitHub Releases
- 正式发布后请更新配置并将 `isPlaceholder` 置为 `false`

## 部署（nginx）

参考 `nginx.conf.example`。核心是 SPA history 路由回退：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

协议页 / 下载页 / 首页均为静态内容，无需后端接口。
