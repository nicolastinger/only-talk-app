<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PresenceTag from '@/components/PresenceTag/index.vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { usePresenceStore } from '@/stores/presence';
import { getFiles } from '@workspace/services';
import type { FriendVo } from '@workspace/types';
import styles from './styles/FriendBox.module.less';

const props = defineProps<{
  friend: FriendVo;
  isSelected?: boolean;
}>();

const router = useRouter();
const presenceStore = usePresenceStore();

const userIcon = ref<string | null>(null);

// 手动状态(忙碌/学习中/自定义等), 与在线离线无关
const presence = computed(
  () =>
    presenceStore.friendPresence[props.friend.friend_id?.toLowerCase() ?? ''],
);

const routeToFriendInfo = () => {
  router.push('/home/contacts/friend?friendId=' + props.friend.friend_id);
  console.log('朋友账号', props.friend.friend_id);
};

// 获取用户头像
const getUserIcon = async (icon: string) => {
  try {
    const FileVos = await getFiles(icon);
    userIcon.value = FileVos?.[0]?.tauri_file_path || null;
  } catch (error) {
    console.log(error);
  }
};

watch(
  () => props.friend.friend_icon,
  (icon) => {
    getUserIcon(icon);
  },
  { immediate: true },
);

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div
    :class="[styles.container, isSelected ? styles.selected : '']"
    @click="routeToFriendInfo"
  >
    <div :class="styles.left">
      <a-badge>
        <img
          :src="userIcon || DEFAULT_ICON"
          :class="styles.imgItem"
          alt="avatar"
          @error="handleImgError"
        />
      </a-badge>
    </div>
    <div :class="styles.center">
      <div :class="styles.centerTitle">
        {{ friend.friend_name }}
        <UserTypeTag :type="friend.friend_user_type" />
      </div>
      <div v-if="presence" :class="styles.centerSub">
        <PresenceTag :presence="presence" />
      </div>
    </div>
  </div>
</template>
