import { computed, ref, type Ref } from 'vue';
import { isRecallChatMessage } from '@/utils/recall';
import { MessageFrom, type ChatMessage } from '@workspace/types';

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
export function useMessageSelection(messages: Ref<ChatMessage[]>) {
  const selectMode = ref(false);
  const selectedIds = ref<Set<string>>(new Set());

  const selectedMessages = computed(() =>
    messages.value.filter((m) =>
      selectedIds.value.has(m.text_msg_raw.nano_id),
    ),
  );

  const isSelected = (msg: ChatMessage) =>
    selectedIds.value.has(msg.text_msg_raw.nano_id);

  const enterSelect = (msg: ChatMessage) => {
    if (!isMessageSelectable(msg)) return;
    selectMode.value = true;
    selectedIds.value = new Set([msg.text_msg_raw.nano_id]);
  };

  const exitSelect = () => {
    selectMode.value = false;
    selectedIds.value = new Set();
  };

  const toggle = (msg: ChatMessage) => {
    if (!isMessageSelectable(msg)) return;
    const id = msg.text_msg_raw.nano_id;
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  };

  const selectableCount = computed(
    () => messages.value.filter(isMessageSelectable).length,
  );

  const allSelected = computed(
    () =>
      selectableCount.value > 0 &&
      selectedIds.value.size === selectableCount.value,
  );

  const toggleAll = () => {
    const ids = messages.value
      .filter(isMessageSelectable)
      .map((m) => m.text_msg_raw.nano_id);
    selectedIds.value =
      selectedIds.value.size === ids.length ? new Set() : new Set(ids);
  };

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
