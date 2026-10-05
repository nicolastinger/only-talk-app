<script setup lang="ts">
const props = defineProps<{ count: number; allSelected: boolean }>();
const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "toggle-all"): void;
  (e: "forward"): void;
  (e: "delete"): void;
}>();
</script>

<template>
  <div class="selection-bar">
    <button class="sel-text" @click="emit('toggle-all')">
      <span class="sel-check" :class="{ on: props.allSelected }" />
      全选
    </button>
    <button class="sel-text" @click="emit('cancel')">取消</button>
    <div class="sel-spacer" />
    <button
      class="sel-action"
      :disabled="count === 0"
      @click="emit('forward')"
    >
      转发<i v-if="count">({{ count }})</i>
    </button>
    <button
      class="sel-action danger"
      :disabled="count === 0"
      @click="emit('delete')"
    >
      删除<i v-if="count">({{ count }})</i>
    </button>
  </div>
</template>

<style scoped lang="less">
.selection-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
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
.sel-spacer {
  flex: 1;
}
.sel-action {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--border-medium);
  background: var(--surface);
  color: var(--brand-blue);
  font-size: 14px;
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
