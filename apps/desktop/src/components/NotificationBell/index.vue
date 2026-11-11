<script setup lang="ts">
import { computed } from 'vue';
import { BellOutlined } from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    count?: number;
    title?: string;
  }>(),
  {
    count: 0,
    title: '',
  },
);

defineEmits<{ (e: 'click'): void }>();

const titleText = computed(() => props.title || t('notification.bellTitle'));
</script>

<template>
  <div :class="styles.notifyBtn" :title="titleText" @click="$emit('click')">
    <a-badge :count="count > 99 ? '99+' : count" :overflow-count="99">
      <BellOutlined />
    </a-badge>
  </div>
</template>
