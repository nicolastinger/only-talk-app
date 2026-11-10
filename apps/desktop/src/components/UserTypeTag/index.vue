<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();

const props = defineProps<{
  /** 用户类型: 0/空 不显示; 1 机器人; 2 企业; 其他非0 特殊 */
  type?: number | null;
}>();

const META: Record<number, { labelKey: string; className: string }> = {
  1: { labelKey: 'userType.robot', className: styles.robot },
  2: { labelKey: 'userType.enterprise', className: styles.enterprise },
};

const meta = computed(() => {
  if (!props.type) return null;
  return (
    META[props.type] ?? { labelKey: 'userType.other', className: styles.other }
  );
});
</script>

<template>
  <span v-if="meta" :class="[styles.tag, meta.className]">
    {{ t(meta.labelKey) }}
  </span>
</template>
