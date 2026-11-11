import type { UiChatMessage } from "./types";
import { getCopyableText } from "./messageParse";

/** 遗留原生文本类型(raw 直接是纯文本), 兼容旧版本落库数据 */
const LEGACY_TEXT_TYPE = 0;

/**
 * 从多选消息中提取可复制的纯文本（仅文本消息，按列表顺序换行拼接）。
 *
 * 图片/文件/语音等非文本消息不参与复制；返回空串表示没有可复制内容。
 */
export const collectCopyableText = (messages: UiChatMessage[]): string => {
  const lines: string[] = [];
  for (const msg of messages) {
    const { text_type, raw } = msg.textMsg;
    const text =
      text_type === LEGACY_TEXT_TYPE ? raw : getCopyableText(text_type, raw);
    const trimmed = text.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines.join("\n");
};

/**
 * 写入系统剪贴板。
 *
 * 移动端 WebView 一般有 `navigator.clipboard`（tauri.localhost 属于安全上下文），
 * 老 WebView 缺少该 API 时降级为隐藏 textarea + `execCommand("copy")`。
 */
export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (!text) throw new Error("no copyable text");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
  if (!copied) throw new Error("copy failed");
};
