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
          if (
            friendUuid &&
            msg.send_user !== friendUuid &&
            msg.send_user !== "system"
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
