import { useBearStore } from '@/store/store';
import { subscribe } from '@workspace/services';
import { SystemNotification } from '@workspace/types';

/**
 * 通知领域 router：单点订阅后端通知事件, 向各业务消费者扇出。
 *
 * - 后端 `listen_notify_msg`(通知到达) / `listen_notify_read`(标记已读) 只订阅一次;
 * - 未读角标(useSystemNotify)、通知面板(NotificationPanel) 等按需注册回调,
 *   避免各自重复 `listen`。
 */
type NotifyListener = () => void;

const listeners = new Set<NotifyListener>();
let started = false;

const fanOut = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[notifyRouter] 通知回调异常:', e);
    }
  });
};

/** 幂等建立底层订阅（首个注册者触发）。 */
const ensureStarted = () => {
  if (started) return;
  started = true;
  subscribe('listen_notify_msg', (payload) => {
    try {
      const notify = JSON.parse(payload) as SystemNotification;
      const uuid = useBearStore.getState().userInfo?.uuid;
      // 只处理当前用户的通知（无法确定归属时放行）
      if (uuid && notify.user_id && notify.user_id !== uuid) return;
      fanOut();
    } catch (e) {
      console.error('[notifyRouter] 解析通知消息失败:', e);
    }
  });
  subscribe('listen_notify_read', fanOut);
};

/**
 * 注册通知变更回调（通知到达/已读时触发）。
 * @returns 取消注册函数
 */
export const onNotifyChange = (listener: NotifyListener): (() => void) => {
  ensureStarted();
  listeners.add(listener);
  return () => listeners.delete(listener);
};
