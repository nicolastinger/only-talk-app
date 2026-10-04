/**
 * 通知分类与 level 层级的共享定义。
 * 通知中心(PC NotificationPanel / 移动端 /notifications)和各业务页面的
 * "本页通知"面板共用同一套分类, 避免两端各自硬编码 level2。
 */
export type NotificationCategoryKey = "friend" | "group" | "plaza" | "moments";

/** 通知中心"全部"分类 key */
export type NotificationCategoryKeyOrAll = NotificationCategoryKey | "all";

/** level1=1 本系统通知下的各子模块 level2 值(见 src-tauri/docs/notification_levels.md) */
export const NOTIFICATION_LEVEL2: Record<NotificationCategoryKey, number> = {
  friend: 1,
  group: 3,
  plaza: 4,
  moments: 5,
};

/** 系统通知 level1(功能大类)固定为 1 */
export const NOTIFICATION_LEVEL1 = 1;
