import { invoke } from '@tauri-apps/api/core';

export const readContactsNotification = async (ids: string[], setAddContacts: (addContacts: number) => void) => {
    try {
        const res = await invoke('batch_read_system_notification', { readIds: ids }) as number;
        if (res <= 0) return;
        setAddContacts(-res);
    } catch (e) {
        console.log('读取联系人通知失败', e);
    }
};
