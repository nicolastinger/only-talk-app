import { useSyncExternalStore } from 'react';

type LogLevel = 'log' | 'info' | 'warn' | 'error';

interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  message: string;
}

const MAX_LOGS = 1000;

let logs: LogEntry[] = [];
let nextId = 0;
let installed = false;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const stringifyArg = (arg: unknown): string => {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

const push = (level: LogLevel, args: unknown[]) => {
  const message = args.map(stringifyArg).join(' ');
  // 仅采集与 WebRTC 相关的日志（[WebRTCService...] / [WebRTCChat...] 等）
  if (!message.includes('[WebRT')) return;
  logs = logs.concat({ id: nextId++, timestamp: Date.now(), level, message });
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(logs.length - MAX_LOGS);
  }
  emit();
};

/** 可被覆盖的 console 方法签名（参数用 unknown，避免 any） */
type ConsoleOverride = {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/**
 * 拦截当前 webview 的 console，仅采集包含 [WebRT 的日志到内存缓冲。
 * 模块级幂等，只作用于当前 WebRTC 窗口，不影响主窗。
 */
export const initWebRTCConsoleCapture = (): (() => void) => {
  if (installed) return () => {};
  installed = true;

  const originals: ConsoleOverride = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const consoleApi = console as unknown as ConsoleOverride;
  consoleApi.log = (...args: unknown[]) => {
    push('log', args);
    originals.log(...args);
  };
  consoleApi.info = (...args: unknown[]) => {
    push('info', args);
    originals.info(...args);
  };
  consoleApi.warn = (...args: unknown[]) => {
    push('warn', args);
    originals.warn(...args);
  };
  consoleApi.error = (...args: unknown[]) => {
    push('error', args);
    originals.error(...args);
  };

  return () => {
    consoleApi.log = originals.log;
    consoleApi.info = originals.info;
    consoleApi.warn = originals.warn;
    consoleApi.error = originals.error;
    installed = false;
  };
};

export const getWebRTCLogs = () => logs;

export const clearWebRTCLogs = () => {
  logs = [];
  emit();
};

export const subscribeWebRTCLogs = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 订阅 WebRTC 日志，日志更新时触发重渲染 */
export const useWebRTCLogs = () => {
  return useSyncExternalStore(subscribeWebRTCLogs, getWebRTCLogs);
};
