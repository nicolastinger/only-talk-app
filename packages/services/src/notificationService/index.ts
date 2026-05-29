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
