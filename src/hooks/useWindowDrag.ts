import { Window } from '@tauri-apps/api/window';
import { useEffect, useRef, useCallback } from 'react';

type DragOptions = {
  /**
   * 是否启用拖拽功能
   * @default true
   */
  enabled?: boolean;
  /**
   * 拖拽手柄选择器，如果指定则只在该元素上触发拖拽。
   * 若未指定且需要区分父元素空白与子元素，请结合 `checkIsHandle` 使用。
   */
  handleSelector?: string;
  /**
   * 自定义判断函数，用于确定事件是否应触发拖拽。
   * 默认行为：当 `handleSelector` 未指定时，仅当事件目标为直接子元素或符合其他条件时触发。
   * @param event 鼠标事件
   * @param dragElement 绑定了拖拽功能的根元素
   * @returns 是否应触发拖拽
   */
  checkIsHandle?: (event: MouseEvent, dragElement: HTMLElement) => boolean;
};

/**
 * 为元素添加窗口拖拽功能的自定义hooks，支持区分父元素空白区域与子元素事件
 *
 * @param options 拖拽选项
 * @returns ref 用于绑定到需要拖拽的根元素
 *
 * @example
 * ```tsx
 * // 基本用法：整个元素可拖拽
 * const dragRef = useWindowDrag();
 *
 * // 指定手柄选择器：只有特定元素可触发拖拽
 * const dragRef = useWindowDrag({ handleSelector: '.drag-handle' });
 *
 * // 自定义判断逻辑：只有点击空白区域才触发
 * const dragRef = useWindowDrag({
 *   checkIsHandle: (event, dragElement) => {
 *     return event.target === dragElement; // 仅当直接点击父元素本身（空白处）时拖拽
 *   }
 * });
 * ```
 */
export const useWindowDrag = (options: DragOptions = {}) => {
  const { enabled = true, handleSelector, checkIsHandle } = options;
  const ref = useRef<HTMLDivElement>(null);

  // 判断事件是否应触发拖拽的函数
  const shouldStartDragging = useCallback((event: MouseEvent, dragElement: HTMLElement): boolean => {
    // 1. 如果提供了自定义判断函数，以其为准
    if (checkIsHandle) {
      return checkIsHandle(event, dragElement);
    }

    // 2. 如果指定了手柄选择器，检查事件目标是否匹配或在其内
    if (handleSelector) {
      const handleElements = dragElement.querySelectorAll(handleSelector);
      let target = event.target as HTMLElement | null;

      while (target && target !== dragElement) {
        for (let i = 0; i < handleElements.length; i++) {
          if (handleElements[i] === target) {
            return true; // 事件目标在手柄元素内
          }
        }
        target = target.parentElement;
      }
      return false; // 事件目标不在任何手柄元素内
    }

    // 3. 默认行为：仅当事件目标是拖拽元素自身（即点击了空白区域）时触发
    // 这对于父div内有子div的情况非常有用
    return event.target === dragElement;
  }, [handleSelector, checkIsHandle]);

  useEffect(() => {
    if (!enabled || !ref.current) {
      return;
    }

    const dragElement = ref.current;

    const handleDrag = async (event: MouseEvent) => {
      // 判断是否应开始拖拽
      if (!shouldStartDragging(event, dragElement)) {
        return; // 不满足条件，不触发拖拽，事件可继续冒泡以供子元素处理
      }

      // 阻止事件冒泡，避免影响父元素的其他事件监听器
      // 注意：如果子元素事件依赖冒泡，需谨慎。此处通常需要阻止以确保拖拽开始时不会意外触发子元素事件。
      event.stopPropagation();

      try {
        // 调用Tauri API开始拖拽窗口
        await Window.getCurrent().startDragging();
      } catch (error) {
        console.error('Failed to start dragging:', error);
      }
    };

    dragElement.addEventListener('mousedown', handleDrag, { capture: true });

    return () => {
      dragElement.removeEventListener('mousedown', handleDrag, { capture: true });
    };
  }, [enabled, shouldStartDragging]); // 依赖项中加入 shouldStartDragging

  return ref;
};