<script setup lang="ts">
import { useI18n } from "@/i18n";

const props = defineProps<{ count: number; allSelected: boolean }>();
const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "toggle-all"): void;
  (e: "copy"): void;
  (e: "forward"): void;
  (e: "delete"): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="selection-bar">
    <button class="sel-text" @click="emit('toggle-all')">
      <span class="sel-check" :class="{ on: props.allSelected }" />
      {{ t("chat.selection.selectAll") }}
    </button>
    <button class="sel-text" @click="emit('cancel')">
      {{ t("common.cancel") }}
    </button>
    <div class="sel-actions">
      <button
        class="sel-action"
        :disabled="count === 0"
        @click="emit('copy')"
      >
        {{ t("chat.actions.copy") }}<i v-if="count">({{ count }})</i>
      </button>
      <button
        class="sel-action"
        :disabled="count === 0"
        @click="emit('forward')"
      >
        {{ t("chat.actions.forward") }}<i v-if="count">({{ count }})</i>
      </button>
      <button
        class="sel-action danger"
        :disabled="count === 0"
        @click="emit('delete')"
      >
        {{ t("chat.actions.delete") }}<i v-if="count">({{ count }})</i>
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.selection-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}
.sel-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
}
.sel-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border-medium);
  box-sizing: border-box;
  &.on {
    border-color: var(--brand-blue);
    background: var(--brand-blue);
    box-shadow: inset 0 0 0 3px var(--surface);
  }
}
.sel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
.sel-action {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-medium);
  background: var(--surface);
  color: var(--brand-blue);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  i {
    font-style: normal;
  }
  &.danger {
    color: #ef4444;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
