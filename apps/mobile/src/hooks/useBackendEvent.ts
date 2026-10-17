import { onMounted, onUnmounted } from "vue";
import {
  subscribe,
  type BackendEventHandler,
  type BackendEventName,
} from "@workspace/services";

/**
 * 订阅后端 emit 事件(统一走 eventHub)。
 * 组件挂载时订阅、卸载时自动退订。
 * @param name 事件名(受 BackendEventPayloads 约束)
 * @param handler 事件回调
 */
export function useBackendEvent<K extends BackendEventName>(
  name: K,
  handler: BackendEventHandler<K>
): void {
  let off: (() => void) | undefined;
  onMounted(() => {
    off = subscribe(name, handler);
  });
  onUnmounted(() => {
    off?.();
    off = undefined;
  });
}
