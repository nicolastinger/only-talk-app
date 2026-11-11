import type { TextQuicMsgVo } from '@workspace/types';

const MSG_TYPE_TEXT = 1;
const MSG_TYPE_GROUP_TEXT = 2001;
/** 遗留原生文本类型(raw 直接是纯文本) */
const LEGACY_TEXT_TYPE = 0;

const parsePrivateText = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw) as { text?: string; content?: string };
    return parsed.text || parsed.content || '';
  } catch {
    return '';
  }
};

const parseGroupText = (raw: string): string => {
  let inner = raw;
  try {
    const outer = JSON.parse(raw) as { text?: unknown };
    if (outer && outer.text !== undefined) inner = String(outer.text);
  } catch {
    // raw 本身就是内层文本
  }
  try {
    const nested = JSON.parse(inner) as { text?: string };
    return typeof nested.text === 'string' ? nested.text : inner;
  } catch {
    return inner;
  }
};

/**
 * 从多选消息中提取可复制的纯文本（仅文本消息，按列表顺序换行拼接）。
 *
 * 图片/文件/语音等非文本消息不参与复制；返回空串表示没有可复制内容。
 */
export const collectCopyableText = (
  messages: Pick<TextQuicMsgVo, 'text_type' | 'raw'>[],
): string => {
  const lines: string[] = [];
  for (const msg of messages) {
    let text = '';
    if (msg.text_type === MSG_TYPE_TEXT) text = parsePrivateText(msg.raw);
    else if (msg.text_type === MSG_TYPE_GROUP_TEXT)
      text = parseGroupText(msg.raw);
    else if (msg.text_type === LEGACY_TEXT_TYPE) text = msg.raw;
    const trimmed = text.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines.join('\n');
};
