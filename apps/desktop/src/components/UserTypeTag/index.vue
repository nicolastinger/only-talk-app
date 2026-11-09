<script setup lang="ts">
import { computed } from 'vue';
import styles from './index.module.less';

const props = defineProps<{
  /** 用户类型: 0/空 不显示; 1 机器人; 2 企业; 其他非0 特殊 */
  type?: number | null;
}>();

const META: Record<number, { label: string; className: string }> = {
  1: { label: '机器人', className: styles.robot },
  2: { label: '企业', className: styles.enterprise },
};

const meta = computed(() => {
  if (!props.type) return null;
  return META[props.type] ?? { label: '特殊', className: styles.other };
});
</script>

<template>
  <span v-if="meta" :class="[styles.tag, meta.className]">{{ meta.label }}</span>
</template>
