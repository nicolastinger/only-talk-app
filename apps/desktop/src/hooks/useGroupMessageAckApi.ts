import { ref } from 'vue';
import type { TextQuicMsgVo } from '@workspace/types';
import { useBackendEvent } from './useBackendEvent';

// 监听群消息 ack 回执
export const useGroupMessageAckApi = (groupId: string) => {
  const groupAckMessage = ref<TextQuicMsgVo>();

  useBackendEvent(
    'group_message_ack',
    (payload) => {
      const text = JSON.parse(payload) as TextQuicMsgVo;
      groupAckMessage.value = text;
    },
    () => groupId !== '',
  );

  return { groupAckMessage };
};
