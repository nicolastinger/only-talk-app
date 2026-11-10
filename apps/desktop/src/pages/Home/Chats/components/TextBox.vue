<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/i18n';

const { t } = useI18n();

type TextMsgRaw = {
  text?: string;
  content?: string;
};

const props = defineProps<{
  raw: string;
}>();

const text = computed(() => {
  if (!props.raw) {
    return t('chat.typeEmpty');
  }

  try {
    const parsed: TextMsgRaw = JSON.parse(props.raw);
    return parsed.text || parsed.content || props.raw;
  } catch {
    return props.raw;
  }
});
</script>

<template>
  <span
    :style="{
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
      lineHeight: 1.5,
    }"
  >
    {{ text }}
  </span>
</template>
