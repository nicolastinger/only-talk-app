<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  BellOutlined,
  MessageOutlined,
  PictureOutlined,
  RadarChartOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import LayoutBtn from '@/components/Button/LayoutBtn.vue';
import NotificationPanel from '@/components/NotificationPanel/index.vue';
import UserInfoModal from './UserInfoModal.vue';
import { DEFAULT_ICON } from '@/constants';
import { useChatsUnread } from '@/hooks/useChatsUnread';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import { getFiles } from '@workspace/services';
import styles from './index.module.less';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBearStore();

const notifyVisible = ref(false);
const userIcon = ref<string | null>(null);
const { totalUnreadCount } = useChatsUnread(() => store.userInfo.uuid);

const isActive = (url: string) =>
  route.path === url || route.path.startsWith(`${url}/`);

const topBtnList = computed(() => [
  {
    text: t('leftAside.chatList'),
    url: '/home/chats',
    icon: MessageOutlined,
    unreadCount: totalUnreadCount.value,
  },
  {
    text: t('leftAside.friendList'),
    url: '/home/contacts',
    icon: UserOutlined,
    unreadCount: store.menuUnread.contacts,
  },
  {
    text: t('leftAside.plaza'),
    url: '/home/plaza',
    icon: RadarChartOutlined,
    unreadCount: store.menuUnread.plaza,
  },
  {
    text: t('leftAside.moments'),
    url: '/home/moments',
    icon: PictureOutlined,
    unreadCount: store.menuUnread.moments,
  },
]);

const bottomBtnList = computed(() => [
  {
    text: t('leftAside.notification'),
    url: 'notification',
    icon: BellOutlined,
    unreadCount: store.menuUnread.total,
  },
  {
    text: t('leftAside.settings'),
    url: '/home/settings',
    icon: SettingOutlined,
    unreadCount: store.menuUnread.settings,
  },
]);

const routeToPage = (url: string) => {
  if (url === 'notification') {
    notifyVisible.value = true;
    return;
  }
  router.push(url);
};

const showModal = () => store.openUserInfoModal();
const handleCancel = () => store.closeUserInfoModal();

const getUserIcon = async () => {
  try {
    const FileVos = await getFiles(store.userInfo.icon || '');
    userIcon.value = FileVos?.[0]?.tauri_file_path || null;
  } catch (error) {
    console.log(error);
  }
};

watch(
  () => store.userInfo,
  () => getUserIcon(),
  { immediate: true },
);

onUnmounted(() => {
  if (userIcon.value) URL.revokeObjectURL(userIcon.value);
});
</script>

<template>
  <div :class="styles.leftSideBar">
    <div :class="styles.top">
      <div :class="styles.header" />
      <div :class="styles.icon" @click="showModal">
        <img
          :width="100"
          :height="100"
          :src="userIcon || DEFAULT_ICON"
          :class="styles.imgItem"
          alt="icon"
          @error="(e) => ((e.target as HTMLImageElement).src = DEFAULT_ICON)"
        />
      </div>
      <div
        v-for="item in topBtnList"
        :key="item.url"
        :class="styles.iconBtn"
        @click="routeToPage(item.url)"
      >
        <LayoutBtn :active="isActive(item.url)" :unread-count="item.unreadCount">
          <template #icon>
            <component :is="item.icon" style="font-size: 18px" />
          </template>
        </LayoutBtn>
      </div>
    </div>
    <div :class="styles.bottom">
      <div
        v-for="item in bottomBtnList"
        :key="item.url"
        :class="styles.iconBtn"
        @click="routeToPage(item.url)"
      >
        <LayoutBtn
          :active="item.url !== 'notification' && isActive(item.url)"
          :unread-count="item.unreadCount"
        >
          <template #icon>
            <component :is="item.icon" style="font-size: 18px" />
          </template>
        </LayoutBtn>
      </div>
    </div>

    <UserInfoModal :visible="store.userInfoModalVisible" @close="handleCancel" />
    <NotificationPanel
      :visible="notifyVisible"
      @close="notifyVisible = false"
    />
  </div>
</template>
