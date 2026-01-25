import { TextMsgRaw } from '@workspace/types';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useState } from 'react';

// 监听目标账号的消息传递,为空则监听全局
const useMessageApi = (sendUuid: string | null, recvUuid: string) => {
  // 窗口内聊天列表
  const [textMessage, setTextMessage] = useState<TextMsgRaw>();

  useEffect(() => {
    if (recvUuid === '') {
      return;
    }
    let unlisten: () => void;

    const setupListener = async () => {
      unlisten = await listen<string>('text_message', (event) => {
        const text = JSON.parse(event.payload) as TextMsgRaw;
        if (text.recv_user !== recvUuid) {
            return;
          }
        // 监听某个账号
        if (sendUuid !== null) {
          // 过滤接收人
          if (text.send_user === sendUuid || text.send_user === 'system') {
            setTextMessage(text);
          }
        } else {
          // 监听全局服务器发送的quic消息处理

        }
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten(); // 组件卸载时取消订阅
    };
  }, [recvUuid, sendUuid]);

  return useMemo(() => ({ textMessage }), [textMessage]);
};

export { useMessageApi };
