import { invoke } from "@tauri-apps/api/core";

export const readContactsNotification = async (
  ids: string[],
  setAddContacts: (addContacts: number) => void
) => {
  try {
    const res = (await invoke("batch_read_system_notification", {
      readIds: ids,
    })) as number;
    if (res <= 0) return;
    setAddContacts(-res);
  } catch (e) {
    console.log("读取联系人通知失败", e);
  }
};

export const clearAllUnreadNotifications = async (
  setMenuUnread: (menuUnread: { contacts: number; groups: number; system: number; settings: number }) => void
) => {
  try {
    await invoke("clear_all_unread_notifications");
    setMenuUnread({ contacts: 0, groups: 0, system: 0, settings: 0 });
  } catch (e) {
    console.log("清空所有未读通知失败", e);
  }
};

export const clearAllUnreadSessions = async () => {
  try {
    await invoke("clear_all_unread_sessions");
  } catch (e) {
    console.log("清空所有未读会话失败", e);
  }
};

/**
 * 按层级条件批量清除未读通知
 * @param level1 -1 表示通配
 * @param level2 -1 表示通配
 * @param level3 -1 表示通配
 * @param level4 -1 表示通配
 * @returns 影响的行数
 */
export const clearUnreadByLevel = async (
  level1: number,
  level2: number,
  level3: number,
  level4: number,
  callback?: (affected: number) => void
) => {
  try {
    const res = (await invoke("clear_unread_by_level", {
      level1,
      level2,
      level3,
      level4,
    })) as number;
    if (res > 0 && callback) {
      callback(res);
    }
    return res;
  } catch (e) {
    console.log("按层级清除未读通知失败", e);
    return 0;
  }
};
