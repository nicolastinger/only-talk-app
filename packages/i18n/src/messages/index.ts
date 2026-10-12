import type { Locale } from "../locales";
import type { LocaleMessages } from "../types";
import zhCN from "./zh-CN";
import zhTW from "./zh-TW";
import enUS from "./en-US";

export type { LocaleMessages, LocaleValue } from "../types";

export const messages: Record<Locale, LocaleMessages> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en-US": enUS,
};
