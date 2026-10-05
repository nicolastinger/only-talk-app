import { ChatMessage } from '@workspace/types';

/** 单聊撤回控制消息类型（对齐后端 MSG_TYPE_RECALL） */
export const MSG_TYPE_RECALL = 3001;
const MSG_TYPE_GROUP_TEXT = 2001;
/** 撤回载荷标记 key（与后端 service::recall 保持一致） */
const RECALL_MARKER = 'ot_recall';

const tryParse = (raw: string): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** 解析撤回载荷 JSON，返回目标 nano_id；非撤回载荷返回 null */
const parseRecallJson = (raw: string): string | null => {
  const parsed = tryParse(raw);
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (obj[RECALL_MARKER] === 1 && typeof obj.target_nano_id === 'string') {
      return obj.target_nano_id;
    }
  }
  return null;
};

/**
 * 判断是否为撤回控制消息并返回目标 nano_id。
 * - 单聊：type=3001，raw 即撤回载荷；
 * - 群聊：type=2001，raw 为外层 GroupTextRecord，内层 text 为撤回载荷。
 */
export const parseRecallTarget = (
  textType: number,
  raw: string,
): string | null => {
  if (textType === MSG_TYPE_RECALL) return parseRecallJson(raw);
  if (textType === MSG_TYPE_GROUP_TEXT) {
    // 乐观上屏时 raw 为内层载荷；落库/接收后为外层 GroupTextRecord
    const direct = parseRecallJson(raw);
    if (direct) return direct;
    const outer = tryParse(raw);
    if (outer && typeof outer === 'object') {
      const text = (outer as Record<string, unknown>).text;
      if (text !== undefined) return parseRecallJson(String(text));
    }
  }
  return null;
};

/** 是否为撤回控制消息 */
export const isRecallMessage = (textType: number, raw: string): boolean =>
  parseRecallTarget(textType, raw) !== null;

/** 是否为撤回控制消息（ChatMessage） */
export const isRecallChatMessage = (msg: ChatMessage): boolean =>
  isRecallMessage(msg.text_msg_raw.text_type, msg.text_msg_raw.raw);
