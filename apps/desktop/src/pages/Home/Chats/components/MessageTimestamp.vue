<script setup lang="ts">
import { computed } from 'vue';
import type { StyleValue } from 'vue';
import { formatMessageTime } from '@/utils/format';
import styles from './styles/MessageTimestamp.module.less';

const props = defineProps<{
  timestamp: number;
  className?: string;
  style?: StyleValue;
}>();

const timeText = computed(() => formatMessageTime(props.timestamp));
</script>

<template>
  <div :class="[styles.timestamp, className]" :style="style">
    <span :class="styles.timestampText">{{ timeText }}</span>
  </div>
</template>
