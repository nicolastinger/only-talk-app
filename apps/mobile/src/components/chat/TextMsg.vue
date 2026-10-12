<script setup lang="ts">
import { computed } from "vue";
import { parseGroupText, parsePrivateText } from "@/chat/messageParse";

const props = defineProps<{
  raw: string;
  isGroup?: boolean;
}>();

const text = computed(() =>
  props.isGroup ? parseGroupText(props.raw) : parsePrivateText(props.raw)
);
</script>

<template>
  <span class="text-msg">{{ text }}</span>
</template>

<style scoped lang="less">
.text-msg {
  word-break: break-word;
  white-space: pre-wrap;
  line-height: 1.5;
}
</style>
