import { CLIENT_CONFIG_KEYS } from "@workspace/types";
import { getConfig, setConfig } from "../appConfig";

/**
 * 夜间免打扰(23:00 - 次日 08:00)。
 *
 * - 开关持久化到公共库 client_config 的 `app.do_not_disturb`(缺省关闭);
 * - Rust 端 `alert::on_incoming_message` 在免打扰时段直接跳过新消息提醒
 *   (不弹横幅 / 不发系统通知, 因此前端也不会播放提示音), 未读照常累计;
 * - 前端在播放提示音前也做一次同样的判断, 避免旧版本后端漏判。
 */

/** 免打扰开始时间(本地时间, 小时) */
export const DND_START_HOUR = 23;
/** 免打扰结束时间(本地时间, 小时, 不含) */
export const DND_END_HOUR = 8;

/** 当前是否开启夜间免打扰(缺省关闭) */
export const isDoNotDisturbEnabled = (): boolean =>
  getConfig(CLIENT_CONFIG_KEYS.doNotDisturb) === "1";

/** 持久化夜间免打扰开关 */
export const setDoNotDisturbEnabled = async (
  enabled: boolean
): Promise<void> => {
  try {
    await setConfig(CLIENT_CONFIG_KEYS.doNotDisturb, enabled ? "1" : "0");
  } catch (e) {
    console.error("保存免打扰设置失败:", e);
  }
};

/** 指定时刻是否落在免打扰时段内(默认当前时刻) */
export const isInDoNotDisturbWindow = (now: Date = new Date()): boolean => {
  const hour = now.getHours();
  return hour >= DND_START_HOUR || hour < DND_END_HOUR;
};
