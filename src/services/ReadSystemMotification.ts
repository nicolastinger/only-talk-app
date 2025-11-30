import { invoke } from "@tauri-apps/api/core";

const readContactsNotification = async (ids: string[], setAddContacts: (addContacts: number) => void) => {
    try {
        // 已读系统通知
        const res = await invoke('batch_read_system_notification', { readIds: ids }) as number;
        if (res <= 0) return;
        // 减去已读数量
        setAddContacts(-res);
    } catch (e) {
        console.log('读取联系人通知失败', e);
    }
};

export { readContactsNotification };