<script setup lang="ts">
import styles from './style/index.module.less';

withDefaults(
  defineProps<{
    active?: boolean;
    unreadCount?: number;
  }>(),
  {
    active: false,
    unreadCount: 0,
  },
);
</script>

<template>
  <div :class="[styles.container, active ? styles.active : '']">
    <slot name="icon" />
    <div v-if="unreadCount > 0" :class="styles.unreadBadge">
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </div>
  </div>
</template>
