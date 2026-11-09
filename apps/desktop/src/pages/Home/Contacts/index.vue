<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import FriendInfo from './components/FriendInfo.vue';
import styles from './index.module.less';

const route = useRoute();

const friendUuid = computed(() => (route.query.friendId as string) || '');

watch(
  friendUuid,
  (value) => {
    console.log('friendUuid', value);
  },
  { immediate: true },
);
</script>

<template>
  <div :class="styles.container">
    <FriendInfo :uuid="friendUuid" />
  </div>
</template>
