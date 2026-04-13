import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

interface QuicDisconnectState {
  isConnected: boolean;
  message: string;
}

/**
 * 监听QUIC连接断开事件的Hook
 * 当QUIC连接断开时，会触发状态更新并显示提示
 */
const useQuicDisconnect = () => {
  const [disconnectState, setDisconnectState] = useState<QuicDisconnectState>({
    isConnected: true,
    message: '',
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<string>('quic_disconnected', (event) => {
        setDisconnectState({
          isConnected: false,
          message: event.payload || 'QUIC连接已断开',
        });
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 重置连接状态（用于重连成功后调用）
  const resetConnection = () => {
    setDisconnectState({
      isConnected: true,
      message: '',
    });
  };

  return {
    ...disconnectState,
    resetConnection,
  };
};

export { useQuicDisconnect };
