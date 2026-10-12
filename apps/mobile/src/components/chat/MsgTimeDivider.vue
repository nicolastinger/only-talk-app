<script setup lang="ts">
import { formatMessageTime } from "@/utils/time";
defineProps<{ timestamp: number }>();
</script>

<template>
  <div class="msg-time-divider">
    <span>{{ formatMessageTime(timestamp) }}</span>
  </div>
</template>

<style scoped lang="less">
.msg-time-divider {
  display: flex;
  justify-content: center;
  padding: 14px 0 10px;
  span {
    font-size: 11px;
    color: var(--text-placeholder);
    background: var(--surface);
    padding: 4px 12px;
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-xs);
  }
}
</style>
