import { TextQuicMsgVo } from '@workspace/types';
import { useMemo, useState } from 'react';
import { useBackendEvent } from './useBackendEvent';

// 监听群消息 ack 回执
const useGroupMessageAckApi = (groupId: string) => {
  const [groupAckMessage, setGroupAckMessage] = useState<TextQuicMsgVo>();

  useBackendEvent(
    'group_message_ack',
    (payload) => {
      const text = JSON.parse(payload) as TextQuicMsgVo;
      setGroupAckMessage(text);
    },
    groupId !== '',
  );

  return useMemo(() => ({ groupAckMessage }), [groupAckMessage]);
};

export { useGroupMessageAckApi };
