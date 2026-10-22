import { onMounted } from "vue";
import {
  armMessageSound,
  isMessageSoundEnabled,
  playMessageSound,
} from "@workspace/services";
import { useBackendEvent } from "./useBackendEvent";

/**
 * 来消息提示音。
 *
 * 复用 Rust 端 `alert_incoming_message`：已过滤自己其它端的回推、系统消息、
 * 当前正在查看的会话，并按会话做去抖；设置里关闭提示音时不播放。
 * 声音为 WebAudio 合成，启动时先解锁音频上下文以绕过自动播放限制。
 */
export function useMessageSound() {
  onMounted(() => {
    armMessageSound();
  });

  useBackendEvent("alert_incoming_message", () => {
    if (!isMessageSoundEnabled()) return;
    playMessageSound();
  });
}
