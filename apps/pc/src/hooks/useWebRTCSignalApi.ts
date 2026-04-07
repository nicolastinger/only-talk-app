import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import { listen } from '@tauri-apps/api/event';
import { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import { useEffect, useMemo, useState } from 'react';

interface WebRTCSignalMsgRaw {
  type: 'offer' | 'answer' | 'candidate';
  sender: string;
  receiver: string;
  sessionId: string;
  data: any;
  timestamp: number;
}

interface TextQuicMsgVo {
  nano_id: string;
  text_type: number;
  raw: string;
  recv_user: string;
  send_user: string;
  timestamp: number;
}

const openWebRTCChatHandler = async (
  friendId: string,
  localUserId: string,
  isInitiator: boolean,
  signalData?: string,
) => {
  let url = `/webrtc/chat?friendId=${friendId}&localUserId=${localUserId}&initiator=${isInitiator}`;
  if (signalData) {
    url += `&signalData=${encodeURIComponent(signalData)}`;
  }
  const webviewOptions: WebviewOptions = {
    x: 0,
    y: 0,
    url: url,
    height: 600,
    width: 800,
  };
  const config: WindowOptions = {
    center: true,
  };
  await openNewWindowWithoutClose(
    `webrtc-chat-${friendId}-${Date.now()}`,
    webviewOptions,
    config,
  );
};

const useWebRTCSignalApi = () => {
  const [state, setState] = useState<boolean>(false);
  const userInfo = useBearStore((state) => state.userInfo);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('webrtc_signal', async (event) => {
          console.log('主窗口收到 WebRTC 信令消息:', event.payload);
          try {
            const msgVo: TextQuicMsgVo = JSON.parse(event.payload);
            const signalMsg: WebRTCSignalMsgRaw = JSON.parse(msgVo.raw);
            const localUserId = userInfo.uuid;

            if (signalMsg.type === 'offer') {
              console.log('收到 offer，打开 WebRTC 聊天窗口');
              await openWebRTCChatHandler(
                signalMsg.sender,
                localUserId,
                false,
                msgVo.raw,
              );
            }
          } catch (e) {
            console.error('处理 WebRTC 信令失败:', e);
          }
        });
      } catch (e) {
        console.error('监听 WebRTC 信令失败:', e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [userInfo.uuid]);

  return useMemo(() => ({ state }), [state]);
};

export { openWebRTCChatHandler, useWebRTCSignalApi };
