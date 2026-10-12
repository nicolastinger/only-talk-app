import { isRecallChatMessage } from '@/utils/recall';
import { ChatMessage, MessageFrom } from '@workspace/types';
import { useCallback, useMemo, useState } from 'react';

/** 瞬态/系统类消息不参与多选 */
const NON_SELECTABLE_TYPES = new Set<number>([
  12, 13, 14, 15, 100, 10001, 10002, 10003, 2004, 2201, 201, 202,
]);

/** 可参与多选的消息 */
export const isMessageSelectable = (msg: ChatMessage): boolean => {
  if (msg.from === MessageFrom.System) return false;
  if (msg.text_msg_raw.send_user === 'system') return false;
  if (msg.ack === false) return false;
  if (isRecallChatMessage(msg)) return false;
  return !NON_SELECTABLE_TYPES.has(msg.text_msg_raw.text_type);
};

/**
 * PC 端聊天记录多选状态（单聊/群聊/自己的笔记共用）。
 * 消息列表本身由各页面本地 state 持有，故通过参数传入。
 */
export function useMessageSelection(messages: ChatMessage[]) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedMessages = useMemo(
    () => messages.filter((m) => selectedIds.has(m.text_msg_raw.nano_id)),
    [messages, selectedIds],
  );

  const isSelected = useCallback(
    (msg: ChatMessage) => selectedIds.has(msg.text_msg_raw.nano_id),
    [selectedIds],
  );

  const enterSelect = useCallback((msg: ChatMessage) => {
    if (!isMessageSelectable(msg)) return;
    setSelectMode(true);
    setSelectedIds(new Set([msg.text_msg_raw.nano_id]));
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback((msg: ChatMessage) => {
    if (!isMessageSelectable(msg)) return;
    const id = msg.text_msg_raw.nano_id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectableCount = useMemo(
    () => messages.filter(isMessageSelectable).length,
    [messages],
  );

  const allSelected = selectableCount > 0 && selectedIds.size === selectableCount;

  const toggleAll = useCallback(() => {
    const ids = messages.filter(isMessageSelectable).map((m) => m.text_msg_raw.nano_id);
    setSelectedIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, [messages]);

  return {
    selectMode,
    selectedIds,
    selectedMessages,
    selectableCount,
    allSelected,
    isSelected,
    enterSelect,
    exitSelect,
    toggle,
    toggleAll,
  };
}
