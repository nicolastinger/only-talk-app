<script setup lang="ts">
import { LockOutlined } from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import styles from './styles/PrivacyModeMessage.module.less';

defineProps<{
  isMine: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <div :class="[styles.container, isMine ? styles.mine : styles.friend]">
    <div :class="styles.iconWrapper">
      <LockOutlined :class="styles.icon" />
    </div>
    <div :class="styles.text">
      {{ isMine ? t('privacyModeMessage.started') : t('privacyModeMessage.otherStarted') }}
    </div>
  </div>
</template>
