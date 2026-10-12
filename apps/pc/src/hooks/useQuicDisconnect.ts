import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { useBearStore } from '@/store/store';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export type StatusTagState = 'offline' | 'reconnecting' | 'online';

interface QuicDisconnectState {
  isConnected: boolean;
  connectionState: ConnectionState;
  message: string;
  statusTag: StatusTagState | null;
}

const SYNC_TIMEOUT_MS = 3 * 60 * 1000; // 3 分钟
const STATUS_TAG_ONLINE_MS = 3 * 1000; // 已上线标签展示时长

/**
 * 监听QUIC连接状态变更的Hook
 * - quic_disconnected: 连接断开，持续收到事件直到恢复
 * - quic_connected: 连接恢复
 * - quic_sync_start: 开始同步离线消息（打开加载遮罩）
 * - quic_sync_complete: 同步完成（关闭加载遮罩）
 */
const useQuicDisconnect = () => {
  const [disconnectState, setDisconnectState] = useState<QuicDisconnectState>({
    isConnected: true,
    connectionState: 'idle',
    message: '',
    statusTag: null,
  });
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnectedRef = useRef(true);
  const setIsSyncing = useBearStore((state) => state.setIsSyncing);

  const clearSyncTimer = () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  };

  const clearStatusTagTimer = () => {
    if (statusTagTimerRef.current) {
      clearTimeout(statusTagTimerRef.current);
      statusTagTimerRef.current = null;
    }
  };

  const showStatusTag = (statusTag: StatusTagState) => {
    clearStatusTagTimer();
    setDisconnectState((prev) => ({ ...prev, statusTag }));
    if (statusTag === 'online') {
      // 已上线标签 3s 后自动关闭
      statusTagTimerRef.current = setTimeout(() => {
        setDisconnectState((prev) => ({ ...prev, statusTag: null }));
      }, STATUS_TAG_ONLINE_MS);
    }
  };

  useEffect(() => {
    let unlistenDisconnected: (() => void) | undefined;
    let unlistenConnected: (() => void) | undefined;
    let unlistenReconnecting: (() => void) | undefined;
    let unlistenSyncStart: (() => void) | undefined;
    let unlistenSyncComplete: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenDisconnected = await listen<string>('quic_disconnected', (event) => {
        setDisconnectState({
          isConnected: false,
          connectionState: 'disconnected',
          message: event.payload || 'QUIC连接已断开',
          statusTag: wasConnectedRef.current ? 'offline' : null,
        });
        // 重复广播不降级：重连中不回退为已离线
        if (wasConnectedRef.current) {
          wasConnectedRef.current = false;
          showStatusTag('offline');
        }
      });

      unlistenConnected = await listen<string>('quic_connected', (_event) => {
        wasConnectedRef.current = true;
        setDisconnectState({
          isConnected: true,
          connectionState: 'connected',
          message: '',
          statusTag: 'online',
        });
        showStatusTag('online');
      });

      // 进入重连尝试：显示重连中
      unlistenReconnecting = await listen<string>('quic_reconnecting', () => {
        showStatusTag('reconnecting');
      });

      // 开始同步：打开加载遮罩，设置超时
      unlistenSyncStart = await listen<string>('quic_sync_start', () => {
        setIsSyncing(true);
        clearSyncTimer();
        syncTimerRef.current = setTimeout(() => {
          setIsSyncing(false);
        }, SYNC_TIMEOUT_MS);
      });

      // 同步完成：立即关闭遮罩
      unlistenSyncComplete = await listen<string>('quic_sync_complete', () => {
        clearSyncTimer();
        setIsSyncing(false);
      });
    };

    setupListeners().catch(console.error);

    return () => {
      if (unlistenDisconnected) unlistenDisconnected();
      if (unlistenConnected) unlistenConnected();
      if (unlistenReconnecting) unlistenReconnecting();
      if (unlistenSyncStart) unlistenSyncStart();
      if (unlistenSyncComplete) unlistenSyncComplete();
      clearSyncTimer();
      clearStatusTagTimer();
    };
  }, []);

  // 重置连接状态（用于重连成功后调用）
  const resetConnection = () => {
    wasConnectedRef.current = true;
    setDisconnectState({
      isConnected: true,
      connectionState: 'connected',
      message: '',
      statusTag: null,
    });
    clearStatusTagTimer();
  };

  return {
    ...disconnectState,
    resetConnection,
  };
};

export { useQuicDisconnect };
