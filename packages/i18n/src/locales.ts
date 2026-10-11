export type Locale = "zh-CN" | "zh-TW" | "en-US";

export const DEFAULT_LOCALE: Locale = "zh-CN";

export const SUPPORTED_LOCALES: Locale[] = ["zh-CN", "zh-TW", "en-US"];

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as string[]).includes(value)
  );
}
