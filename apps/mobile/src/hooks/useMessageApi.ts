import { ref, onMounted, onUnmounted } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TextQuicMsgVo } from "@workspace/types";

export function useMessageApi(
  recvUuidGetter: () => string,
  friendUuid?: string,
  isGroup?: boolean
) {
  const textMessage = ref<TextQuicMsgVo | null>(null);
  let unlisten: UnlistenFn | null = null;

  const setupListener = async () => {
    unlisten = await listen<string>("text_message", (event) => {
      try {
        const msg: TextQuicMsgVo = JSON.parse(event.payload);
        const targetUuid = recvUuidGetter();

        if (isGroup) {
          // Group mode: match by recv_user (groupId)
          if (msg.recv_user !== targetUuid) return;
        } else {
          // 1-on-1 mode: match by recv_user (my UUID)
          if (msg.recv_user !== targetUuid) return;
          // 自己其他端发送的消息(self-echo)会被回推: send_user=我, recv_user=好友。
          // 若好友不是当前会话对象也丢弃, 避免串会话。
          if (
            friendUuid &&
            msg.send_user !== friendUuid &&
            msg.send_user !== "system" &&
            msg.send_user !== targetUuid
          )
            return;
          if (
            msg.send_user === targetUuid &&
            friendUuid &&
            msg.recv_user !== friendUuid
          )
            return;
        }
        textMessage.value = msg;
      } catch (e) {
        console.error("解析text_message失败:", e);
      }
    });
  };

  onMounted(() => {
    setupListener().catch(console.error);
  });
  onUnmounted(() => {
    if (unlisten) unlisten();
  });

  return { textMessage };
}
