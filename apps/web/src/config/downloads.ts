/**
 * 下载源配置（单一数据源）。
 *
 * 安装包统一通过 GitHub Releases 发布，官网直接指向「最新发行版」页面：
 *   https://github.com/nicolastinger/only-talk-app/releases/latest
 * 不硬编码具体资产文件名，发新版后官网无需改动。
 */

/** 客户端工程仓库 */
export const GITHUB_APP_REPO_URL =
  "https://github.com/nicolastinger/only-talk-app";
/** 服务端工程仓库 */
export const GITHUB_RS_REPO_URL =
  "https://github.com/nicolastinger/only-talk-rs";

/** 客户端发行版（Releases）地址 */
export const GITHUB_RELEASES_URL = `${GITHUB_APP_REPO_URL}/releases`;
/** 最新发行版地址 */
export const LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest`;

export interface DownloadEntry {
  id: "windows" | "linux" | "android";
  icon: string;
  /** 该平台下载入口（统一指向最新发行版页面） */
  url: string;
}

export const DOWNLOADS: DownloadEntry[] = [
  { id: "windows", icon: "🪟", url: LATEST_RELEASE_URL },
  { id: "linux", icon: "🐧", url: LATEST_RELEASE_URL },
  { id: "android", icon: "🤖", url: LATEST_RELEASE_URL },
];
