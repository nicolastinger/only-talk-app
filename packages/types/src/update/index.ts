/** 应用更新信息(get_latest_release 返回, 数据源 GitHub Releases) — 镜像 src-tauri UpdateInfo */
interface UpdateInfo {
  /** 最新版本号(去掉前导 v), 如 1.0.1 */
  version: string;
  /** 最新版本原始 tag, 如 v1.0.1 */
  tag_name: string;
  /** 更新日志(release body) */
  notes: string;
  /** 发布时间(RFC3339) */
  published_at: string;
  /** 匹配当前平台/架构的安装包文件名 */
  file_name: string;
  /** 安装包下载地址 */
  download_url: string;
  /** 安装包大小(字节) */
  size: number;
  /** SHA-256 摘要(小写 hex, 旧资产可能为空) */
  sha256?: string;
  /** 是否强制更新 */
  force_update: boolean;
}

export type { UpdateInfo };