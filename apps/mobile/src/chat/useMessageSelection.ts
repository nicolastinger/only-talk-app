import { computed, ref, type Ref } from "vue";
import type { UiChatMessage } from "./types";
import { isRecallMessage, isTransientMessageType } from "./messageParse";
import { SYSTEM_LIKE_TYPES } from "./messageTypes";

/** 可参与多选的消息：排除系统行、撤回提示、瞬态消息、发送中/失败临时气泡 */
export const isMessageSelectable = (msg: UiChatMessage): boolean =>
  msg.from !== "system" &&
  msg.textMsg.send_user !== "system" &&
  msg.ack !== false &&
  !msg.failed &&
  !isTransientMessageType(msg.textMsg.text_type) &&
  !isRecallMessage(msg.textMsg.text_type, msg.textMsg.raw) &&
  !SYSTEM_LIKE_TYPES.includes(msg.textMsg.text_type);

/** 移动端聊天记录多选状态（单聊/群聊页面共用） */
export function useMessageSelection(messages: Ref<UiChatMessage[]>) {
  const selectMode = ref(false);
  const selectedIds = ref<string[]>([]);

  const isSelected = (msg: UiChatMessage): boolean =>
    selectedIds.value.includes(msg.textMsg.nano_id);

  const selectedMessages = computed(() =>
    messages.value.filter((m) => selectedIds.value.includes(m.textMsg.nano_id))
  );

  const selectableCount = computed(
    () => messages.value.filter(isMessageSelectable).length
  );

  const allSelected = computed(
    () =>
      selectableCount.value > 0 &&
      selectedIds.value.length === selectableCount.value
  );

  /** 进入多选并选中该条 */
  const enterSelect = (msg: UiChatMessage) => {
    if (!isMessageSelectable(msg)) return;
    selectMode.value = true;
    if (!isSelected(msg)) {
      selectedIds.value = [...selectedIds.value, msg.textMsg.nano_id];
    }
  };

  const exitSelect = () => {
    selectMode.value = false;
    selectedIds.value = [];
  };

  const toggle = (msg: UiChatMessage) => {
    if (!isMessageSelectable(msg)) return;
    const id = msg.textMsg.nano_id;
    selectedIds.value = isSelected(msg)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id];
  };

  const toggleAll = () => {
    const ids = messages.value.filter(isMessageSelectable).map((m) => m.textMsg.nano_id);
    selectedIds.value =
      selectedIds.value.length === ids.length ? [] : ids;
  };

  /** 删除后从选中集合中移除（用于本地移除消息） */
  const removeIds = (ids: string[]) => {
    selectedIds.value = selectedIds.value.filter((x) => !ids.includes(x));
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
    removeIds,
  };
}
