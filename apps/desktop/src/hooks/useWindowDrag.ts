import { onMounted, onUnmounted, ref } from 'vue';
import { Window } from '@tauri-apps/api/window';

type DragOptions = {
  enabled?: boolean;
  handleSelector?: string;
  checkIsHandle?: (event: MouseEvent, dragElement: HTMLElement) => boolean;
};

/**
 * 为元素添加窗口拖拽功能的自定义 hooks，支持区分父元素空白区域与子元素事件。
 */
export const useWindowDrag = (options: DragOptions = {}) => {
  const { enabled = true, handleSelector, checkIsHandle } = options;
  const dragElementRef = ref<HTMLDivElement | null>(null);

  const shouldStartDragging = (
    event: MouseEvent,
    dragElement: HTMLElement,
  ): boolean => {
    if (checkIsHandle) return checkIsHandle(event, dragElement);

    if (handleSelector) {
      const handleElements = dragElement.querySelectorAll(handleSelector);
      let target = event.target as HTMLElement | null;
      while (target && target !== dragElement) {
        for (let i = 0; i < handleElements.length; i++) {
          if (handleElements[i] === target) return true;
        }
        target = target.parentElement;
      }
      return false;
    }

    return event.target === dragElement;
  };

  const handleDrag = async (event: MouseEvent) => {
    const dragElement = dragElementRef.value;
    if (!dragElement || !shouldStartDragging(event, dragElement)) return;
    event.stopPropagation();
    try {
      await Window.getCurrent().startDragging();
    } catch (error) {
      console.error('Failed to start dragging:', error);
    }
  };

  onMounted(() => {
    if (!enabled || !dragElementRef.value) return;
    dragElementRef.value.addEventListener('mousedown', handleDrag, {
      capture: true,
    });
  });

  onUnmounted(() => {
    dragElementRef.value?.removeEventListener('mousedown', handleDrag, {
      capture: true,
    });
  });

  return dragElementRef;
};
