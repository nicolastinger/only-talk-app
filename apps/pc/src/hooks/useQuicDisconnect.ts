import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface QuicDisconnectState {
  isConnected: boolean;
  connectionState: ConnectionState;
  message: string;
}

/**
 * 监听QUIC连接状态变更的Hook
 * - quic_disconnected: 连接断开，持续收到事件直到恢复
 * - quic_connected: 连接恢复
 */
const useQuicDisconnect = () => {
  const [disconnectState, setDisconnectState] = useState<QuicDisconnectState>({
    isConnected: true,
    connectionState: 'idle',
    message: '',
  });

  useEffect(() => {
    let unlistenDisconnected: (() => void) | undefined;
    let unlistenConnected: (() => void) | undefined;

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
    };

    setupListeners().catch(console.error);

    return () => {
      if (unlistenDisconnected) unlistenDisconnected();
      if (unlistenConnected) unlistenConnected();
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
