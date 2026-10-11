import { computed, ref } from "vue";
import { getAppLanguage, kv_get, kv_set, setConfig } from "@workspace/services";
import { CLIENT_CONFIG_KEYS } from "@workspace/types";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  translate,
  type Locale,
} from "@workspace/i18n";

export { SUPPORTED_LOCALES, isLocale };
export type { Locale };

/** 会话级 kv 键(与 PC 对齐) */
const LOCALE_KEY = "ui_locale";

const currentLocale = ref<Locale>(DEFAULT_LOCALE);

function applyHtmlLang(value: Locale) {
  document.documentElement.setAttribute("lang", value);
}

/** 读取当前语言 */
export function getLocale(): Locale {
  return currentLocale.value;
}

/** 切换语言: 同步 kv 与客户端配置表(app.language), 模板中的 t() 会自动更新 */
export function setLocale(value: Locale) {
  if (!isLocale(value) || value === currentLocale.value) return;
  currentLocale.value = value;
  applyHtmlLang(value);
  kv_set(LOCALE_KEY, value).catch(() => {});
  setConfig(CLIENT_CONFIG_KEYS.appLanguage, value).catch(() => {});
}

/** 翻译: 在模板/渲染中调用可自动响应语言切换 */
export function t(key: string, params?: Record<string, unknown>): string {
  return translate(currentLocale.value, key, params);
}

export function useI18n() {
  return {
    locale: computed(() => currentLocale.value),
    setLocale,
    getLocale,
    t,
  };
}

/**
 * 启动时初始化语言: 优先会话级 kv(ui_locale)，无记录时回退客户端配置表(app.language)。
 * 需在 initAppConfig() 之后调用。
 */
export async function initLocale(): Promise<void> {
  let value: string | undefined;
  try {
    value = (await kv_get(LOCALE_KEY)) ?? undefined;
  } catch {
    /* ignore */
  }
  if (!isLocale(value)) {
    const fallback = getAppLanguage();
    if (isLocale(fallback)) value = fallback;
  }
  if (isLocale(value)) {
    currentLocale.value = value;
  }
  applyHtmlLang(currentLocale.value);
}
