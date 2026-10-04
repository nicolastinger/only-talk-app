<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    count?: number;
    title?: string;
  }>(),
  { count: 0, title: "本页通知" }
);

const emit = defineEmits<{ (e: "click"): void }>();

const badgeText = computed(() =>
  props.count > 99 ? "99+" : String(props.count)
);
</script>

<template>
  <button class="notify-link" :title="title" @click="emit('click')">
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
      />
    </svg>
    <span v-if="count > 0" class="bell-dot">{{ badgeText }}</span>
  </button>
</template>

<style scoped lang="less">
.notify-link {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  box-shadow: var(--shadow-xs);

  &:active {
    background: var(--gradient-primary);
    border-color: transparent;
    color: #fff;
  }

  svg {
    width: 17px;
    height: 17px;
  }
}

.bell-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--badge-bg);
  color: var(--badge-text);
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  box-sizing: border-box;
}
</style>
