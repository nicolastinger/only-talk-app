import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { useBearStore } from '@/store/store';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface QuicDisconnectState {
  isConnected: boolean;
  connectionState: ConnectionState;
  message: string;
}

const SYNC_TIMEOUT_MS = 3 * 60 * 1000; // 3 分钟

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
  });
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setIsSyncing = useBearStore((state) => state.setIsSyncing);

  const clearSyncTimer = () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  };

  useEffect(() => {
    let unlistenDisconnected: (() => void) | undefined;
    let unlistenConnected: (() => void) | undefined;
    let unlistenSyncStart: (() => void) | undefined;
    let unlistenSyncComplete: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenDisconnected = await listen<string>('quic_disconnected', (event) => {
        setDisconnectState({
          isConnected: false,
          connectionState: 'disconnected',
          message: event.payload || 'QUIC连接已断开',
        });
      });

      unlistenConnected = await listen<string>('quic_connected', (_event) => {
        setDisconnectState({
          isConnected: true,
          connectionState: 'connected',
          message: '',
        });
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
      if (unlistenSyncStart) unlistenSyncStart();
      if (unlistenSyncComplete) unlistenSyncComplete();
      clearSyncTimer();
    };
  }, []);

  // 重置连接状态（用于重连成功后调用）
  const resetConnection = () => {
    setDisconnectState({
      isConnected: true,
      connectionState: 'connected',
      message: '',
    });
  };

  return {
    ...disconnectState,
    resetConnection,
  };
};

export { useQuicDisconnect };
