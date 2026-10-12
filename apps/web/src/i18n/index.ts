import { computed, ref } from "vue";
import zh from "./locales/zh";
import en from "./locales/en";

export type Locale = "zh" | "en";

export const messages: Record<Locale, MessageSchema> = { zh, en };

const current = ref<Locale>("zh");

export const locale = current;

export function isSupportedLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

export function setLocale(next: Locale) {
  current.value = next;
  document.documentElement.setAttribute("lang", next === "zh" ? "zh-CN" : "en");
}

/** 从 URL query 解析语言：?lang=zh / ?lang=en，无效或缺失时返回默认 zh */
export function resolveLocaleFromUrl(
  search: string = window.location.search
): Locale {
  const lang = new URLSearchParams(search).get("lang");
  return isSupportedLocale(lang) ? lang : "zh";
}

/** 在组件中获取响应式的当前语言消息对象 */
export function useMessages() {
  const t = computed(() => messages[current.value]);
  return { locale, t };
}

export type MessageSchema = typeof zh;
export type { MessageSchema as I18nSchema };
