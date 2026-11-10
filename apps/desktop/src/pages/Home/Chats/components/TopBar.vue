<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { MenuProps } from 'ant-design-vue';
import {
  DeleteOutlined,
  MoreOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import PresenceTag from '@/components/PresenceTag/index.vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { usePresenceStore } from '@/stores/presence';
import { useBearStore } from '@/stores/app';
import { delete_friend } from '@workspace/services';
import type { FriendVo } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import FriendSettingsPanel from './FriendSettingsPanel.vue';
import styles from './styles/TopBar.module.less';

const props = defineProps<{
  title: string;
  friendInfo?: FriendVo;
}>();

const { t } = useI18n();
const router = useRouter();
const store = useBearStore();
const presenceStore = usePresenceStore();

const deleteModalVisible = ref(false);
const friendSettingsOpen = ref(false);

// 好友手动状态(忙碌/学习中/自定义等)
const presence = computed(
  () =>
    presenceStore.friendPresence[
      props.friendInfo?.friend_id?.toLowerCase() ?? ''
    ],
);

watch(
  () => props.friendInfo?.friend_id,
  (friendId) => {
    if (!friendId) return;
    presenceStore.loadFriendPresence([friendId], 'merge');
  },
  { immediate: true },
);

const handleViewProfile = () => {
  if (props.friendInfo?.friend_id) {
    router.push('/home/contacts/friend?friendId=' + props.friendInfo.friend_id);
  }
};

const handleDeleteFriend = () => {
  deleteModalVisible.value = true;
};

const confirmDeleteFriend = async () => {
  if (!props.friendInfo?.friend_id) return;

  try {
    await delete_friend(props.friendInfo.friend_id);
    feedback.message.success(t('chat.topBar.friendDeleted'));
    deleteModalVisible.value = false;
    store.triggerRefresh();
    router.push('/home/chats');
  } catch (error) {
    feedback.message.error(t('chat.topBar.deleteFailed'));
    console.error('删除好友失败:', error);
  }
};

/** 好友设置(聊天背景/免打扰/屏蔽/举报)统一收进右侧抽屉，避免下拉菜单过长 */
const menuItems = computed<MenuProps['items']>(() => [
  {
    key: 'profile',
    label: t('chat.topBar.viewProfile'),
    icon: h(UserOutlined),
  },
  {
    key: 'settings',
    label: t('chat.friendSettings'),
    icon: h(SettingOutlined),
  },
  {
    type: 'divider',
  },
  {
    key: 'delete',
    label: t('chat.topBar.deleteFriend'),
    icon: h(DeleteOutlined),
    danger: true,
  },
]);

/** 下拉菜单点击：antdv 4 的 Dropdown 只认 `#overlay` 插槽，菜单点击在这里统一分发 */
const onMenuClick: MenuProps['onClick'] = ({ key }) => {
  switch (String(key)) {
    case 'profile':
      handleViewProfile();
      break;
    case 'settings':
      friendSettingsOpen.value = true;
      break;
    case 'delete':
      handleDeleteFriend();
      break;
  }
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.leftContainer">
      <span :class="styles.titleText">{{ title }}</span>
      <UserTypeTag :type="friendInfo?.friend_user_type" />
      <PresenceTag :presence="presence" />
    </div>
    <div :class="styles.rightContainer">
      <a-dropdown :trigger="['click']" placement="bottomRight">
        <template #overlay>
          <a-menu :items="menuItems" @click="onMenuClick" />
        </template>
        <MoreOutlined :class="styles.moreIcon" />
      </a-dropdown>
    </div>
    <a-modal
      :title="t('chat.topBar.confirmDelete')"
      :open="deleteModalVisible"
      :closable="false"
      :ok-text="t('chat.topBar.confirm')"
      :cancel-text="t('chat.topBar.cancel')"
      :ok-button-props="{ danger: true }"
      @ok="confirmDeleteFriend"
      @cancel="deleteModalVisible = false"
    >
      <p>
        {{ t('chat.topBar.confirmDeleteMsg', { name: friendInfo?.friend_name || title }) }}
      </p>
      <p style="color: #999; font-size: 12px">
        {{ t('chat.topBar.deleteWarning') }}
      </p>
    </a-modal>
    <FriendSettingsPanel
      v-if="friendInfo?.friend_id"
      v-model:open="friendSettingsOpen"
      :friend-info="friendInfo"
      @changed="store.triggerRefresh()"
    />
  </div>
</template>
