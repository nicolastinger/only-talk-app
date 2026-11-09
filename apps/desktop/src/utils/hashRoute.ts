/**
 * 桌面端使用 hash 路由。Tauri 多窗口创建时需要把业务路径转成 `/#/...`，
 * 否则新窗口会加载 `/` 并被路由重定向到登录页。
 */
export const toHashRoute = (path: string): string => {
  if (path.startsWith('#/')) return `/${path}`;
  if (path.startsWith('/#')) return path;
  return `/#${path.startsWith('/') ? path : `/${path}`}`;
};
