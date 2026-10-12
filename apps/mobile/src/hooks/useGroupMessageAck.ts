import { ref, onMounted, onUnmounted } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TextQuicMsgVo } from "@workspace/types";

/**
 * 监听群消息送达 ack 回执（对齐 PC useGroupMessageAckApi）
 * 服务端在 src-tauri 侧通过 "group_message_ack" 事件回推：
 * payload = TextQuicMsgVo，raw 携带被确认的本地 nano_id。
 */
export function useGroupMessageAck(groupId: string) {
  const groupAckMessage = ref<TextQuicMsgVo | null>(null);
  let unlisten: UnlistenFn | null = null;

  onMounted(() => {
    listen<string>("group_message_ack", (event) => {
      try {
        const msg: TextQuicMsgVo = JSON.parse(event.payload);
        if (msg.recv_user && msg.recv_user !== groupId) return;
        groupAckMessage.value = msg;
      } catch (e) {
        console.error("解析 group_message_ack 失败:", e);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);
  });

  onUnmounted(() => {
    if (unlisten) unlisten();
  });

  return { groupAckMessage };
}
