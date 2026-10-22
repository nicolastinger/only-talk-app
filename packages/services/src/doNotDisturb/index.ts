import { CLIENT_CONFIG_KEYS } from "@workspace/types";
import { getConfig, setConfig } from "../appConfig";

/**
 * 免打扰(用户自定义时段)。
 *
 * - 开关持久化在 `app.do_not_disturb`(缺省关闭);
 * - 时段持久化在 `app.do_not_disturb_start` / `app.do_not_disturb_end`
 *   (HH:mm, 本地时间), 缺省 23:00 - 08:00;
 * - 时段规则: [start, end) 左闭右开; start > end 表示跨天; start === end 视为全天;
 * - Rust 端 `alert::on_incoming_message` 用同一套规则跳过新消息提醒
 *   (不弹横幅 / 不发系统通知, 前端也不会播放提示音), 未读照常累计;
 * - 前端播放提示音前也做一次同样判断, 兜底旧版本后端。
 */

/** 缺省免打扰开始时间 */
export const DND_DEFAULT_START = "23:00";
/** 缺省免打扰结束时间 */
export const DND_DEFAULT_END = "08:00";

export interface DoNotDisturbRange {
  /** 开始时间 HH:mm */
  start: string;
  /** 结束时间 HH:mm */
  end: string;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeHHmm = (value: string | undefined, fallback: string): string =>
  value && HHMM_RE.test(value.trim()) ? value.trim() : fallback;

/** 解析 "HH:mm" 为当日分钟数(0..1439), 非法返回 null */
export const parseHHmmToMinutes = (value: string): number | null => {
  const trimmed = value.trim();
  if (!HHMM_RE.test(trimmed)) return null;
  const [hour, minute] = trimmed.split(":");
  return Number(hour) * 60 + Number(minute);
};

/** 读取当前免打扰时段(缺省/非法值回退到 23:00 - 08:00) */
export const getDoNotDisturbRange = (): DoNotDisturbRange => ({
  start: normalizeHHmm(
    getConfig(CLIENT_CONFIG_KEYS.doNotDisturbStart),
    DND_DEFAULT_START
  ),
  end: normalizeHHmm(
    getConfig(CLIENT_CONFIG_KEYS.doNotDisturbEnd),
    DND_DEFAULT_END
  ),
});

/** 持久化免打扰时段(非法值忽略, 不写入) */
export const setDoNotDisturbRange = async (
  start: string,
  end: string
): Promise<void> => {
  if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) return;
  try {
    await setConfig(CLIENT_CONFIG_KEYS.doNotDisturbStart, start);
    await setConfig(CLIENT_CONFIG_KEYS.doNotDisturbEnd, end);
  } catch (e) {
    console.error("保存免打扰时段失败:", e);
  }
};

/** 当前是否开启免打扰(缺省关闭) */
export const isDoNotDisturbEnabled = (): boolean =>
  getConfig(CLIENT_CONFIG_KEYS.doNotDisturb) === "1";

/** 持久化免打扰开关 */
export const setDoNotDisturbEnabled = async (
  enabled: boolean
): Promise<void> => {
  try {
    await setConfig(CLIENT_CONFIG_KEYS.doNotDisturb, enabled ? "1" : "0");
  } catch (e) {
    console.error("保存免打扰设置失败:", e);
  }
};

/** 指定时刻是否处于免打扰时段(默认当前时刻与当前配置) */
export const isInDoNotDisturbWindow = (
  now: Date = new Date(),
  range: DoNotDisturbRange = getDoNotDisturbRange()
): boolean => {
  const start = parseHHmmToMinutes(range.start);
  const end = parseHHmmToMinutes(range.end);
  if (start === null || end === null) return false;
  // 起止相同 = 全天免打扰
  if (start === end) return true;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  // 跨天时段: 如 23:00 - 08:00
  return nowMinutes >= start || nowMinutes < end;
};
