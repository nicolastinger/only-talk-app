import { TextQuicMsgVo } from '@workspace/types';
import { useMemo, useState } from 'react';
import { useBackendEvent } from './useBackendEvent';

// 监听目标账号的消息传递,为空则监听全局
const useMessageApi = (sendUuid: string | null, recvUuid: string) => {
  // 窗口内聊天列表
  const [textMessage, setTextMessage] = useState<TextQuicMsgVo>();

  useBackendEvent(
    'text_message',
    (payload) => {
      const text = JSON.parse(payload) as TextQuicMsgVo;
      // 自己其他端发送的消息(self-echo)会被回推: send_user=我, recv_user=好友。
      // 需在 recv_user 与 sendUuid 过滤之前放行。
      if (sendUuid && text.send_user === recvUuid && text.recv_user === sendUuid) {
        setTextMessage(text);
        return;
      }
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
        // 群聊模式：接收所有发给该groupId的消息
        setTextMessage(text);
      }
    },
    recvUuid !== '',
  );

  return useMemo(() => ({ textMessage }), [textMessage]);
};

export { useMessageApi };
