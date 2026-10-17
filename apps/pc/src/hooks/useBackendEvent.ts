import { useEffect, useRef } from "react";
import {
  subscribe,
  type BackendEventHandler,
  type BackendEventName,
} from "@workspace/services";

/**
 * 订阅后端 emit 事件(统一走 eventHub)。
 * handler 变更不会重新订阅; 组件卸载自动退订。
 * @param name 事件名(受 BackendEventPayloads 约束)
 * @param handler 事件回调
 * @param enabled 为 false 时暂不订阅
 */
export function useBackendEvent<K extends BackendEventName>(
  name: K,
  handler: BackendEventHandler<K>,
  enabled = true
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return subscribe(name, (payload) => ref.current(payload));
  }, [name, enabled]);
}
