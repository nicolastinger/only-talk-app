import { DEFAULT_LOCALE, type Locale } from "./locales";
import { messages } from "./messages";
import type { LocaleMessages, LocaleValue } from "./types";

/**
 * 树节点既可以是值，又可以有子节点（如 menu.chats 既是"会话"，又有 menu.chats.chat）。
 * 这种混合节点用保留键 `$` 存自身值，避免与子键冲突。
 */
export const SELF_KEY = "$";

/** 用 {name} 风格的占位符做插值 */
export function interpolate(
  template: string,
  params?: Record<string, unknown>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    params[key] !== undefined ? String(params[key]) : match
  );
}

/** 按点分路径在树里取值；命中混合节点的自身值用 `$`。 */
function resolvePath(root: LocaleValue, key: string): string | undefined {
  const parts = key.split(".");
  let current: LocaleValue | undefined = root;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = current[part];
    } else {
      return undefined;
    }
  }
  if (typeof current === "string") return current;
  if (current && typeof current === "object") {
    const self = current[SELF_KEY];
    if (typeof self === "string") return self;
  }
  return undefined;
}

/** 纯函数翻译：无框架依赖，供各端包一层响应式/渲染层使用 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, unknown>
): string {
  const dict = messages[locale] ?? messages[DEFAULT_LOCALE];
  const value = resolvePath(dict, key);
  if (value === undefined) return key;
  return interpolate(value, params);
}

/** 把树拍平成点分键（供 react-intl/umi 这类按扁平 id 查找的运行时使用） */
export function flattenMessages(
  nested: LocaleMessages,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  for (const [key, value] of Object.entries(nested)) {
    if (key === SELF_KEY) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      const self = value[SELF_KEY];
      if (typeof self === "string") out[path] = self;
      flattenMessages(value as LocaleMessages, path, out);
    } else {
      out[path] = String(value);
    }
  }
  return out;
}
