<script setup lang="ts">
import { useI18n } from '@/i18n';
import styles from './Guide.module.less';

interface Props {
  name: string;
}

defineProps<Props>();

const { t } = useI18n();
</script>

<template>
  <a-layout>
    <a-row>
      <a-typography-title :level="3" :class="styles.title">
        {{ t('welcome.title') }} <strong>{{ name }}</strong> ！
      </a-typography-title>
    </a-row>
  </a-layout>
</template>
