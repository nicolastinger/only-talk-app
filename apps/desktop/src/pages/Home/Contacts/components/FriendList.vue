<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import FriendBox from '@/pages/Home/Contacts/components/FriendBox.vue';
import { usePresenceStore } from '@/stores/presence';
import { useBearStore } from '@/stores/app';
import type { FriendVo } from '@workspace/types';
import styles from './styles/FriendList.module.less';

const friends = ref<FriendVo[]>([]);
const store = useBearStore();
const presenceStore = usePresenceStore();
const route = useRoute();

// 获取朋友列表
const getFriendList = async () => {
  try {
    const friendQueue: FriendVo[] = await invoke('get_friend_list');
    console.log('朋友列表', friendQueue);
    friends.value = friendQueue;
    // 列表到手后一次性拉取这批好友的手动状态(服务端只存 48h)
    presenceStore.loadFriendPresence(
      friendQueue.map((friend) => friend.friend_id).filter(Boolean),
    );
  } catch (error) {
    console.error(error);
  }
};

onMounted(() => {
  getFriendList();
});

watch(
  () => store.refreshFlag,
  (refreshFlag) => {
    if (refreshFlag > 0) {
      getFriendList();
    }
  },
);

const selectedFriendId = computed(() => (route.query.friendId as string) || '');
</script>

<template>
  <div :class="styles.container">
    <template v-if="friends.length > 0">
      <div v-for="friend in friends" :key="friend.friend_id">
        <FriendBox
          :key="friend.friend_id"
          :friend="friend"
          :is-selected="selectedFriendId === friend.friend_id"
        />
      </div>
    </template>
  </div>
</template>
