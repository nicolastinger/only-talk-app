import {
  App,
  Modal as StaticModal,
  message as staticMessage,
  notification as staticNotification,
} from 'ant-design-vue';

type AppContext = ReturnType<typeof App.useApp>;

let appContext: AppContext | null = null;

/**
 * 在 <a-app> 子组件中绑定 Ant Design Vue 的上下文，
 * 让静态 message/modal/notification 也能跟随主题。
 */
export function bindFeedback(context: AppContext) {
  appContext = context;
}

/** 优先使用 App 上下文实例，未绑定时回退到静态 API（独立窗口/启动早期） */
function proxyApi<T extends object>(
  fallback: T,
  pick: () => object | null,
): T {
  return new Proxy(fallback, {
    get(_target, prop, receiver) {
      const api = (pick() ?? fallback) as T;
      const value = Reflect.get(api, prop, api);
      if (typeof value === 'function') {
        return value.bind(api);
      }
      return value ?? Reflect.get(fallback, prop, receiver);
    },
  }) as T;
}

export const feedback = {
  message: proxyApi(staticMessage, () => appContext?.message ?? null),
  modal: proxyApi(StaticModal, () =>
    appContext ? (appContext.modal as unknown as typeof StaticModal) : null,
  ),
  notification: proxyApi(staticNotification, () =>
    appContext?.notification ?? null,
  ),
};
