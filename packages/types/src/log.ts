// ===== 通用日志(app_log) — 开发者面板日志查看 =====

/** 日志等级(与 src-tauri/entity/app_log.rs 对齐) */
export const LOG_LEVEL_DEBUG = 0;
export const LOG_LEVEL_INFO = 1;
export const LOG_LEVEL_WARN = 2;
export const LOG_LEVEL_ERROR = 3;

/** 通用日志表记录(app_log) */
export interface AppLog {
  id: number;
  /** 日志类型(如 QUIC) */
  log_type: string;
  /** 等级: 0=Debug 1=Info 2=Warn 3=Error */
  level: number;
  /** 来源模块 */
  source: string;
  /** 日志文本 */
  raw: string;
  /** 远端地址 */
  remote_addr: string;
  /** 扩展详情(JSON) */
  detail: string;
  /** 创建时间(毫秒时间戳) */
  created_at: number;
}

/** 分页查询返回(get_app_logs 命令) */
export interface LogPage {
  total: number;
  list: AppLog[];
}

// ===== 客户端日志文件(fast_log, logs/only_talk.log 每日滚动) =====

/** 客户端日志文件信息(get_client_log_files 命令) */
export interface LogFileInfo {
  name: string;
  size: number;
  modified_at: number;
}

/** 客户端日志文件内容(read_client_log_file 命令) */
export interface LogFileContent {
  name: string;
  total_lines: number;
  lines: string[];
}
