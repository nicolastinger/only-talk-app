# Only Talk 官网（apps/web）

纯前端 SPA 官网，Vue3 + TypeScript + Vite，与桌面端 / 移动端客户端分离，**不引入任何 Tauri 相关依赖**，也**不引用 `@workspace/services` / `@workspace/types`**（这两个共享包内部依赖 `@tauri-apps/*`）。构建产物由 nginx 静态托管。

## 页面

| 路由         | 说明                                 |
| ------------ | ------------------------------------ |
| `/`          | 首页（Hero / 特性 / CTA）            |
| `/download`  | 下载发布页（各平台客户端安装包）     |
| `/privacy`   | 隐私协议                             |
| `/agreement` | 用户使用协议                         |

## 开发

```bash
pnpm --filter @workspace/app-web dev      # http://localhost:5180（strictPort）
```

## 构建

```bash
pnpm --filter @workspace/app-web build    # 内置 vue-tsc 类型检查，产物在 dist/
```

## 下载配置

下载入口统一维护在 `src/config/downloads.ts`（单一数据源），统一指向 GitHub 最新发行版页面：

- `GITHUB_RELEASES_URL` / `LATEST_RELEASE_URL`：`https://github.com/nicolastinger/only-talk-app/releases/latest`
- header 的两个仓库地址：`GITHUB_APP_REPO_URL` / `GITHUB_RS_REPO_URL`

不硬编码资产文件名，发新版后官网无需改动。

## 部署（子域名 www.onlytalk.cn）

官网与后端共用同一台部署机与 nginx 网关（配置在 `only-talk-rs/deploy/`）：

1. 官网 CD：`.github/workflows/deploy-web.yml` 构建 `apps/web`，把 `dist` 同步到后端部署目录
   `<home>/only-talk-rs-deploy/deploy/web`。
2. 后端 nginx 网关以 `WEB_DOMAIN`（`www.onlytalk.cn`）托管该目录（bind-mount，同步即生效，无需 reload）。
3. 证书由后端 certbot 以多 SAN 证书覆盖 `onlytalk.cn` + `www.onlytalk.cn`；80 端口保留给 ACME。

核心是 SPA history 路由回退：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

本地或独立 nginx 可参考 `nginx.conf.example`。协议页 / 下载页 / 首页均为静态内容，无需后端接口。
