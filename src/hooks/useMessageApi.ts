import { TextMsgRaw } from '@/types/user/common';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useState } from 'react';

// 监听目标账号的消息传递,为空则监听全局
const useMessageApi = (targetAccount: string | null) => {
  const [textMessage, setTextMessage] = useState<TextMsgRaw>();
  console.log('渲染时间', new Date().getTime());

  useEffect(() => {
    console.log('当前监听的用户账号为', targetAccount);
    let unlisten: () => void;

    const setupListener = async () => {
      unlisten = await listen<string>('text_message', (event) => {
        console.log('接收到的数据', event.payload, targetAccount);
        // 监听某个账号
        if (targetAccount !== null) {
          const text = JSON.parse(event.payload) as TextMsgRaw;
          console.log('序列化后信息', text);
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
