<script setup lang="ts">
import { computed } from "vue";
import { parseSystemContent } from "@/chat/messageParse";

const props = defineProps<{
  /** 已解析好的显示文本 */
  content?: string;
  /** 原始 raw（若 content 未传则自动解析） */
  raw?: string;
}>();

const text = computed(() => props.content ?? parseSystemContent(props.raw ?? ""));
</script>

<template>
  <div class="system-msg">
    <span>{{ text }}</span>
  </div>
</template>

<style scoped lang="less">
.system-msg {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  span {
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-placeholder);
    text-align: center;
    padding: 6px 12px;
    background: var(--card-bg);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-xs);
    max-width: 85%;
    word-break: break-word;
  }
}
</style>
