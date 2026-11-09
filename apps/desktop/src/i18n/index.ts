import { computed, ref } from 'vue';
import {
  getAppLanguage,
  kv_get,
  kv_set,
  setAppLanguage,
} from '@workspace/services';
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
} from '@workspace/i18n';

export { SUPPORTED_LOCALES, isLocale } from '@workspace/i18n';
export type { Locale } from '@workspace/i18n';

/** 会话级 kv 键(与移动端对齐) */
const LOCALE_KEY = 'ui_locale';
/** 旧版 PC 使用的 kv 键, 读取时兼容 */
const LEGACY_LOCALE_KEY = 'ui_language';

const currentLocale = ref<Locale>(DEFAULT_LOCALE);

function applyHtmlLang(value: Locale) {
  document.documentElement.setAttribute('lang', value);
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
  kv_set(LEGACY_LOCALE_KEY, value).catch(() => {});
  setAppLanguage(value).catch(() => {});
}

/**
 * 翻译: 在模板/渲染中调用可自动响应语言切换。
 * @param key 点分翻译 key
 * @param params `{name}` 占位符参数
 * @param defaultMessage key 缺失时的兜底文案
 */
export function t(
  key: string,
  params?: Record<string, unknown>,
  defaultMessage?: string,
): string {
  const result = translate(currentLocale.value, key, params);
  return result === key && defaultMessage ? defaultMessage : result;
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
 * 启动时初始化语言: 优先会话级 kv(ui_locale)，兼容旧 key(ui_language)，
 * 无记录时回退客户端配置表(app.language)。
 * 需在 initAppConfig() 之后调用。
 */
export async function initLocale(): Promise<void> {
  let value: string | undefined;
  try {
    value =
      (await kv_get(LOCALE_KEY)) ??
      (await kv_get(LEGACY_LOCALE_KEY)) ??
      undefined;
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
