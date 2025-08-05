import { TextMsgRaw } from '@/types/user/common';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useState } from 'react';

// 监听目标账号的消息传递,为空则监听全局
const useMessageApi = (targetAccount: string | null) => {
  const [textMessage, setTextMessage] = useState<TextMsgRaw>();

  useEffect(() => {
    let unlisten: () => void;

    const setupListener = async () => {
      unlisten = await listen<string>('text_message', (event) => {
        // 监听某个账号
        if (targetAccount !== null) {
          const text = JSON.parse(event.payload) as TextMsgRaw;
          if (text.send_user === targetAccount || text.send_user === "system"){
             setTextMessage(text);
          }
        } else {
          // TODO 监听全局服务器发送的quic消息处理
        }
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten(); // 组件卸载时取消订阅
    };
  }, [targetAccount]);

  return useMemo(() => ({ textMessage }), [textMessage]);
};

export default useMessageApi;
