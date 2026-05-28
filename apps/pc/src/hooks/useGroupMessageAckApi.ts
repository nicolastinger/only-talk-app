import { listen } from '@tauri-apps/api/event';
import { TextQuicMsgVo } from '@workspace/types';
import { useEffect, useMemo, useState } from 'react';

// 监听群消息 ack 回执
const useGroupMessageAckApi = (groupId: string) => {
  const [groupAckMessage, setGroupAckMessage] = useState<TextQuicMsgVo>();

  useEffect(() => {
    if (groupId === '') {
      return;
    }
    let unlisten: () => void;

    const setupListener = async () => {
      unlisten = await listen<string>('group_message_ack', (event) => {
        const text = JSON.parse(event.payload) as TextQuicMsgVo;
        setGroupAckMessage(text);
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [groupId]);

  return useMemo(() => ({ groupAckMessage }), [groupAckMessage]);
};

export { useGroupMessageAckApi };
