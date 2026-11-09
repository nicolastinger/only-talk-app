<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  BellOutlined,
  DeleteOutlined,
  MoreOutlined,
  StopOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';
import PresenceTag from '@/components/PresenceTag/index.vue';
import ReportModal from '@/components/ReportModal/index.vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { usePresenceStore } from '@/stores/presence';
import { useBearStore } from '@/stores/app';
import { block_friend, delete_friend, unblock_friend } from '@workspace/services';
import { ReportTargetType, type FriendVo } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
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
const blockModalVisible = ref(false);
const reportModalVisible = ref(false);

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

const handleMute = () => {
  feedback.message.info(t('chat.topBar.muteDeveloping'));
};

const handleUnblock = async () => {
  if (!props.friendInfo?.friend_id) return;

  try {
    await unblock_friend(props.friendInfo.friend_id);
    feedback.message.success(t('chat.topBar.unblockedSuccess'));
    store.triggerRefresh();
  } catch (error) {
    feedback.message.error(t('chat.topBar.unblockedFailed'));
    console.error('取消拉黑失败:', error);
  }
};

const handleBlock = () => {
  if (props.friendInfo?.is_block === 1) {
    handleUnblock();
  } else {
    blockModalVisible.value = true;
  }
};

const confirmBlock = async () => {
  if (!props.friendInfo?.friend_id) return;

  try {
    await block_friend(props.friendInfo.friend_id);
    feedback.message.success(t('chat.topBar.blockedSuccess'));
    blockModalVisible.value = false;
    store.triggerRefresh();
  } catch (error) {
    feedback.message.error(t('chat.topBar.blockedFailed'));
    console.error('拉黑好友失败:', error);
  }
};

const menuItems = computed(() => ({
  items: [
    {
      key: 'profile',
      label: t('chat.topBar.viewProfile'),
      icon: h(UserOutlined),
      onClick: handleViewProfile,
    },
    {
      key: 'mute',
      label: t('chat.topBar.muteNotifications'),
      icon: h(BellOutlined),
      onClick: handleMute,
    },
    {
      key: 'block',
      label:
        props.friendInfo?.is_block === 1
          ? t('chat.topBar.unblockFriend')
          : t('chat.topBar.blockFriend'),
      icon: h(StopOutlined),
      onClick: handleBlock,
    },
    {
      key: 'report',
      label: t('report.action'),
      icon: h(WarningOutlined),
      onClick: () => {
        reportModalVisible.value = true;
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: t('chat.topBar.deleteFriend'),
      icon: h(DeleteOutlined),
      danger: true,
      onClick: handleDeleteFriend,
    },
  ],
}));
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.leftContainer">
      <span :class="styles.titleText">{{ title }}</span>
      <UserTypeTag :type="friendInfo?.friend_user_type" />
      <PresenceTag :presence="presence" />
    </div>
    <div :class="styles.rightContainer">
      <a-dropdown :menu="menuItems" :trigger="['click']" placement="bottomRight">
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
    <a-modal
      :title="t('chat.topBar.confirmBlock')"
      :open="blockModalVisible"
      :closable="false"
      :ok-text="t('chat.topBar.confirm')"
      :cancel-text="t('chat.topBar.cancel')"
      :ok-button-props="{ danger: true }"
      @ok="confirmBlock"
      @cancel="blockModalVisible = false"
    >
      <p>
        {{ t('chat.topBar.confirmBlockMsg', { name: friendInfo?.friend_name || title }) }}
      </p>
      <p style="color: #999; font-size: 12px">
        {{ t('chat.topBar.blockWarning') }}
      </p>
    </a-modal>
    <ReportModal
      v-if="friendInfo?.friend_id"
      :open="reportModalVisible"
      :target-type="ReportTargetType.USER"
      :target-uuid="friendInfo.friend_id"
      :target-name="friendInfo.friend_name || title"
      @close="reportModalVisible = false"
    />
  </div>
</template>
