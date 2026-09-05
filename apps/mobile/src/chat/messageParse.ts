import type {
  FileRecord,
  GroupFileRecord,
  GroupImageRecord,
  ImageRecord,
  TextQuicMsgVo,
} from "@workspace/types";
import {
  MSG_TYPE_FILE,
  MSG_TYPE_GROUP_FILE,
  MSG_TYPE_GROUP_IMAGE,
  MSG_TYPE_GROUP_NOTIFICATION,
  MSG_TYPE_GROUP_TEXT,
  MSG_TYPE_IMAGE,
  MSG_TYPE_P2P,
  MSG_TYPE_P2P_VIDEO_CALL,
  MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
  MSG_TYPE_P2P_VIDEO_CALL_END,
  MSG_TYPE_P2P_VIDEO_CALL_INVITE,
  MSG_TYPE_P2P_VIDEO_CALL_REJECT,
  MSG_TYPE_TEXT,
  MSG_TYPE_WEBRTC_SIGNAL,
} from "./messageTypes";

/**
 * 聊天消息 raw 解析层。
 * 与 PC 端 (Chats/components/*ChatBox.tsx 及 GroupChat/*ChatBox.tsx) 逻辑一一对应：
 *  - 单聊：raw 是单层 JSON / 或发送中的本地文件路径
 *  - 群聊：raw 是双层 JSON {"text":"<内层>","send_user":"..."} / 或发送中的本地路径
 */

/** 判断 raw 是否为本地文件路径（发送中的临时消息） */
export const isLocalFilePath = (raw: string): boolean => {
  if (raw.startsWith("{") || raw.startsWith("[")) return false;
  return (
    raw.includes(":\\") || raw.startsWith("/") || raw.startsWith("file://")
  );
};

/** 安全 JSON 解析 */
const tryParseJson = <T>(raw: string): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/** 从绝对路径提取文件名 */
export const basename = (path: string): string => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || "unknown";
};

/** 从文件名提取扩展名 */
export const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1) : "";
};

/* ==================== 单聊（text_type 1/2/3） ==================== */

/** 单聊文本：raw = {"text":"...","prev_id":"","platform":0} */
export const parsePrivateText = (raw: string): string => {
  const parsed = tryParseJson<{ text?: string; content?: string }>(raw);
  const text = parsed?.text || parsed?.content || raw;
  return text || "[空消息]";
};

/** 单聊图片 biz_id：raw = ImageRecord JSON */
export const parsePrivateImageBizId = (raw: string): string | null => {
  if (isLocalFilePath(raw)) return null;
  return tryParseJson<ImageRecord>(raw)?.biz_id || null;
};

/** 单聊文件：raw = FileRecord JSON */
export const parsePrivateFileRecord = (raw: string): FileRecord | null => {
  if (isLocalFilePath(raw)) return null;
  return tryParseJson<FileRecord>(raw);
};

/* ==================== 群聊（text_type 2001/2002/2003） ==================== */

/**
 * 解一层群聊外层 JSON：{"text":"<内容字符串>","send_user":"..."}
 */
export const unwrapGroupOuter = (raw: string): { text?: string; send_user?: string } | null => {
  if (isLocalFilePath(raw)) return null;
  const outer = tryParseJson<{ text?: unknown; send_user?: string }>(raw);
  if (!outer || outer.text === undefined) return null;
  return { text: String(outer.text), send_user: outer.send_user };
};

/** 群聊文本内容：纯文本或双层 JSON 均兼容 */
export const parseGroupText = (raw: string): string => {
  if (isLocalFilePath(raw)) return raw;
  const outer = unwrapGroupOuter(raw);
  const inner = outer ? outer.text : raw;
  if (!inner) return raw || "[空消息]";
  const nested = tryParseJson<{ text?: string }>(inner);
  if (nested && typeof nested.text === "string") return nested.text || "[空消息]";
  return inner;
};

/** 群聊图片内层：raw 双层 JSON → GroupImageRecord */
export const parseGroupImageRecord = (raw: string): GroupImageRecord | null => {
  if (isLocalFilePath(raw)) return null;
  const outer = unwrapGroupOuter(raw);
  const inner = outer?.text ?? raw;
  return tryParseJson<GroupImageRecord>(inner);
};

export const parseGroupImageBizId = (raw: string): string | null => {
  return parseGroupImageRecord(raw)?.biz_id || null;
};

/** 群聊文件内层：raw 双层 JSON → GroupFileRecord */
export const parseGroupFileRecord = (raw: string): GroupFileRecord | null => {
  if (isLocalFilePath(raw)) return null;
  const outer = unwrapGroupOuter(raw);
  const inner = outer?.text ?? raw;
  return tryParseJson<GroupFileRecord>(inner);
};

/* ==================== 通知/系统 ==================== */

/** 群通知 / 系统消息内容：通常 raw 是 {"text":"...","content":"..."} 或纯文本 */
export const parseSystemContent = (raw: string): string => {
  const parsed = tryParseJson<{ text?: string; content?: string }>(raw);
  const text = parsed?.text || parsed?.content || raw;
  return text || "[通知]";
};

/* ==================== WebRTC / 通话控制 ==================== */

export interface ParsedSignal {
  type: string;
  sender?: string;
  receiver?: string;
  sessionId?: string;
  data?: unknown;
  timestamp?: number;
  media?: string;
}

/** 解析 12-15 控制消息 与 100 信令 的 raw（存储格式的 WebRTC 记录） */
export const parseSignalRecord = (raw: string): ParsedSignal | null => {
  const parsed = tryParseJson<ParsedSignal>(raw);
  if (!parsed || typeof parsed.type !== "string") return null;
  return parsed;
};

/* ==================== 预览/兜底文案 ==================== */

/** 会话列表 / 未知类型 的兜底文案（对齐 PC Search.formatMessage） */
export const getMessageDisplayText = (
  text_type: number,
  raw: string
): string => {
  switch (text_type) {
    case MSG_TYPE_TEXT:
      return parsePrivateText(raw);
    case MSG_TYPE_GROUP_TEXT:
      return parseGroupText(raw);
    case MSG_TYPE_IMAGE:
    case MSG_TYPE_GROUP_IMAGE:
      return "[图片]";
    case MSG_TYPE_FILE:
    case MSG_TYPE_GROUP_FILE:
      return "[文件]";
    case MSG_TYPE_P2P:
      return "[隐私消息]";
    case MSG_TYPE_P2P_VIDEO_CALL:
    case MSG_TYPE_P2P_VIDEO_CALL_INVITE:
      return "[视频通话邀请]";
    case MSG_TYPE_P2P_VIDEO_CALL_ACCEPT:
      return "[已接听]";
    case MSG_TYPE_P2P_VIDEO_CALL_REJECT:
      return "[已拒绝]";
    case MSG_TYPE_P2P_VIDEO_CALL_END:
      return "[通话结束]";
    case MSG_TYPE_WEBRTC_SIGNAL: {
      const signal = parseSignalRecord(raw);
      if (signal?.type === "offer") return "[视频通话]";
      if (signal?.type === "answer") return "[已接听]";
      if (signal?.type === "end") return "[通话结束]";
      if (signal?.type === "candidate") return "[通话信令]";
      return "[WebRTC信令]";
    }
    case MSG_TYPE_GROUP_NOTIFICATION:
      return parseSystemContent(raw);
    default:
      return raw || "[未知消息]";
  }
};

/** 时间分隔判断：与上一条相隔 > 10 分钟 则展示时间 */
export const needTimeDivider = (
  prevTimestamp: number,
  currentTimestamp: number
): boolean => {
  if (!prevTimestamp) return true;
  return Math.abs(currentTimestamp - prevTimestamp) >= 10 * 60 * 1000;
};

/** 判断某条消息是否需要按“自己发送/回执状态”渲染（mine 判定复用） */
export const isMineMessage = (
  msg: TextQuicMsgVo,
  meUuid: string
): boolean => msg.send_user === meUuid;
