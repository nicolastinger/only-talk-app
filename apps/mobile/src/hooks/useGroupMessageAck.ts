import { ref } from "vue";
import type { TextQuicMsgVo } from "@workspace/types";
import { useBackendEvent } from "./useBackendEvent";

/**
 * 监听群消息送达 ack 回执（对齐 PC useGroupMessageAckApi）
 * 服务端在 src-tauri 侧通过 "group_message_ack" 事件回推：
 * payload = TextQuicMsgVo，raw 携带被确认的本地 nano_id。
 */
export function useGroupMessageAck(groupId: string) {
  const groupAckMessage = ref<TextQuicMsgVo | null>(null);

  useBackendEvent("group_message_ack", (payload) => {
    try {
      const msg: TextQuicMsgVo = JSON.parse(payload);
      if (msg.recv_user && msg.recv_user !== groupId) return;
      groupAckMessage.value = msg;
    } catch (e) {
      console.error("解析 group_message_ack 失败:", e);
    }
  });

  return { groupAckMessage };
}
