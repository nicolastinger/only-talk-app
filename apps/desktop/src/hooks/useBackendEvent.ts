import { onMounted, onUnmounted, watch } from 'vue';
import {
  subscribe,
  type BackendEventHandler,
  type BackendEventName,
} from '@workspace/services';

/**
 * 订阅后端 emit 事件(统一走 eventHub)。
 * 组件挂载时订阅、卸载时自动退订；enabled 变化时自动订阅/退订。
 * @param name 事件名(受 BackendEventPayloads 约束)
 * @param handler 事件回调
 * @param enabled 为 false 时暂不订阅
 */
export function useBackendEvent<K extends BackendEventName>(
  name: K,
  handler: BackendEventHandler<K>,
  enabled: boolean | (() => boolean) = true,
): void {
  let off: (() => void) | undefined;

  const isEnabled = () =>
    typeof enabled === 'function' ? enabled() : enabled;

  const stop = () => {
    off?.();
    off = undefined;
  };

  const start = () => {
    stop();
    if (!isEnabled()) return;
    off = subscribe(name, handler);
  };

  onMounted(start);
  watch(isEnabled, (value) => {
    if (value) start();
    else stop();
  });
  onUnmounted(stop);
}
