<script setup lang="ts">
import friendsSvg from '@/assets/svg/friends.svg';
import { useI18n } from '@/i18n';
import styles from './styles/Dashboard.module.less';

const { t } = useI18n();
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.content">
      <img :src="friendsSvg" alt="friends" :class="styles.svgItem" />
      <div :class="styles.text">{{ t('chat.selectFriend') }}</div>
    </div>
  </div>
</template>
