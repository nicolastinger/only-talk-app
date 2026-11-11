/**
 * 移动端软键盘避让：把页面根元素高度设置为「当前可见高度」。
 *
 * 兼容三种情况：
 *  - Android adjustResize：window.innerHeight 变小
 *  - iOS / 沉浸式键盘：visualViewport.height 变小（innerHeight 不变）
 *  - 事件信号不稳定：ResizeObserver + focus/focusout + 延时多次校正
 */

export const getVisibleViewportHeight = (): number => {
  const vv = window.visualViewport;
  const inner = window.innerHeight;
  const vvHeight = vv ? vv.height : inner;
  // 键盘弹出时取较小值；异常时至少保留 200px，避免布局塌陷
  return Math.max(200, Math.min(inner, vvHeight));
};

/**
 * 将元素高度绑定到可见视口高度，返回解绑函数。
 *
 * @param rootGetter 返回需要绑定高度的根元素
 * @param onApplied  每次应用完可见高度后回调（如软键盘弹出/收起时重新贴底）
 */
export function attachViewportHeight(
  rootGetter: () => HTMLElement | null,
  onApplied?: () => void
): () => void {
  const apply = () => {
    const el = rootGetter();
    if (!el) return;
    el.style.height = `${getVisibleViewportHeight()}px`;
    onApplied?.();
  };

  apply();

  const listeners: Array<[EventTarget, string, EventListener]> = [];
  const listen = (target: EventTarget | null, type: string, fn: EventListener) => {
    if (!target) return;
    target.addEventListener(type, fn);
    listeners.push([target, type, fn]);
  };

  const onResize = () => apply();
  const onFocus = () => {
    // IME 展开可能稍晚，延迟多次校正
    setTimeout(apply, 80);
    setTimeout(apply, 250);
    setTimeout(apply, 600);
  };
  const onBlur = () => {
    setTimeout(apply, 60);
  };

  listen(window, "resize", onResize);
  listen(window.visualViewport, "resize", onResize);
  listen(window.visualViewport, "scroll", onResize);
  listen(window, "focusin", onFocus);
  listen(window, "focusout", onBlur);

  let observer: ResizeObserver | null = null;
  try {
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(onResize);
      observer.observe(document.documentElement);
    }
  } catch {
    // ignore
  }

  return () => {
    listeners.forEach(([t, type, fn]) => t.removeEventListener(type, fn));
    observer?.disconnect();
  };
}
