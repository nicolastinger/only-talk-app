import { onUnmounted, ref } from 'vue';
import { useBearStore } from '@/stores/app';
import { t } from '@/i18n';
import { useBackendEvent } from './useBackendEvent';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export type StatusTagState = 'offline' | 'reconnecting' | 'online';

const SYNC_TIMEOUT_MS = 3 * 60 * 1000; // 3 分钟
const STATUS_TAG_ONLINE_MS = 3 * 1000; // 已上线标签展示时长

/**
 * 监听QUIC连接状态变更的Hook
 * - quic_disconnected: 连接断开，持续收到事件直到恢复
 * - quic_connected: 连接恢复
 * - quic_sync_start: 开始同步离线消息（打开加载遮罩）
 * - quic_sync_complete: 同步完成（关闭加载遮罩）
 */
export const useQuicDisconnect = () => {
  const isConnected = ref(true);
  const connectionState = ref<ConnectionState>('idle');
  const message = ref('');
  const statusTag = ref<StatusTagState | null>(null);

  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let statusTagTimer: ReturnType<typeof setTimeout> | null = null;
  let wasConnected = true;

  const store = useBearStore();
  const setIsSyncing = store.setIsSyncing;

  const clearSyncTimer = () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  };

  const clearStatusTagTimer = () => {
    if (statusTagTimer) {
      clearTimeout(statusTagTimer);
      statusTagTimer = null;
    }
  };

  const showStatusTag = (next: StatusTagState) => {
    clearStatusTagTimer();
    statusTag.value = next;
    if (next === 'online') {
      statusTagTimer = setTimeout(() => {
        statusTag.value = null;
      }, STATUS_TAG_ONLINE_MS);
    }
  };

  useBackendEvent('quic_disconnected', (payload) => {
    isConnected.value = false;
    connectionState.value = 'disconnected';
    message.value = payload || t('quicDisconnect.disconnectSuccess');
    statusTag.value = wasConnected ? 'offline' : null;
    // 重复广播不降级：重连中不回退为已离线
    if (wasConnected) {
      wasConnected = false;
      showStatusTag('offline');
    }
  });

  useBackendEvent('quic_connected', () => {
    wasConnected = true;
    isConnected.value = true;
    connectionState.value = 'connected';
    message.value = '';
    statusTag.value = 'online';
    showStatusTag('online');
  });

  useBackendEvent('quic_reconnecting', () => {
    showStatusTag('reconnecting');
  });

  useBackendEvent('quic_sync_start', () => {
    setIsSyncing(true);
    clearSyncTimer();
    syncTimer = setTimeout(() => {
      setIsSyncing(false);
    }, SYNC_TIMEOUT_MS);
  });

  useBackendEvent('quic_sync_complete', () => {
    clearSyncTimer();
    setIsSyncing(false);
  });

  onUnmounted(() => {
    clearSyncTimer();
    clearStatusTagTimer();
  });

  const resetConnection = () => {
    wasConnected = true;
    isConnected.value = true;
    connectionState.value = 'connected';
    message.value = '';
    statusTag.value = null;
    clearStatusTagTimer();
  };

  return {
    isConnected,
    connectionState,
    message,
    statusTag,
    resetConnection,
  };
};
