/**
 * 下载源配置（单一数据源）。
 *
 * 注意：当前所有直链均为占位符。上线前请：
 * 1. 将真实安装包放入 apps/web/public/downloads/（或由 nginx /downloads/ 目录托管），
 *    并把 localUrl 改为真实文件名；
 * 2. 在 GitHub Releases 发布各平台安装包后，把 releaseUrl 改为对应资产链接；
 * 3. 将 isPlaceholder 置为 false。
 */

export const GITHUB_RELEASES_URL =
  "https://github.com/nicolastinger/only-talk-app/releases";

export interface DownloadEntry {
  id: "windows" | "linux" | "android";
  icon: string;
  /** GitHub Releases 对应平台资产链接（占位） */
  releaseUrl: string;
  /** nginx /downloads/ 目录下的直链（占位） */
  localUrl: string;
  /** 是否为占位链接（真实安装包尚未发布） */
  isPlaceholder: boolean;
}

export const DOWNLOADS: DownloadEntry[] = [
  {
    id: "windows",
    icon: "🪟",
    releaseUrl: `${GITHUB_RELEASES_URL}/latest`,
    localUrl: "/downloads/only-talk-setup-1.0.0.exe",
    isPlaceholder: true,
  },
  {
    id: "linux",
    icon: "🐧",
    releaseUrl: `${GITHUB_RELEASES_URL}/latest`,
    localUrl: "/downloads/only-talk-1.0.0.AppImage",
    isPlaceholder: true,
  },
  {
    id: "android",
    icon: "🤖",
    releaseUrl: `${GITHUB_RELEASES_URL}/latest`,
    localUrl: "/downloads/only-talk-1.0.0.apk",
    isPlaceholder: true,
  },
];
