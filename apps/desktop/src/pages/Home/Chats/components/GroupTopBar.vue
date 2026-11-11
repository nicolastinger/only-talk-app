<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { MenuProps } from 'ant-design-vue';
import { MoreOutlined, HistoryOutlined, WarningOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { ReportTargetType } from '@workspace/types';
import ReportModal from '@/components/ReportModal/index.vue';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import ChatHistoryDrawer from './ChatHistoryDrawer.vue';
import styles from './styles/TopBar.module.less';

const props = defineProps<{
  title: string;
  groupId: string;
  memberCount: number;
}>();

const { t } = useI18n();
const router = useRouter();
const reportModalVisible = ref(false);
const historyOpen = ref(false);

const handleLeaveGroup = () => {
  feedback.modal.confirm({
    title: t('chat.group.leaveGroup'),
    content: t('chat.group.leaveGroupConfirm'),
    okText: t('chat.group.confirm'),
    cancelText: t('chat.group.cancel'),
    onOk: async () => {
      try {
        await invoke('leave_group_command', { groupId: props.groupId });
        router.push('/home/chats/dashboard');
      } catch (e) {
        console.log('退出群聊失败', e);
      }
    },
  });
};

const handleViewGroupInfo = () => {
  router.push(`/home/chats/group-info?groupId=${props.groupId}`);
};

const menuItems = computed<MenuProps['items']>(() => [
  {
    key: 'info',
    label: t('chat.group.groupInfo'),
  },
  {
    key: 'settings',
    label: t('chat.group.groupSettings'),
  },
  {
    key: 'history',
    label: t('chatHistory.title'),
    icon: h(HistoryOutlined),
  },
  {
    key: 'report',
    label: t('report.action'),
    icon: h(WarningOutlined),
  },
  {
    type: 'divider',
  },
  {
    key: 'leave',
    label: t('chat.group.leaveGroup'),
    danger: true,
  },
]);

/** 下拉菜单点击：antdv 4 的 Dropdown 只认 `#overlay` 插槽，菜单点击在这里统一分发 */
const onMenuClick: MenuProps['onClick'] = ({ key }) => {
  switch (String(key)) {
    case 'info':
      handleViewGroupInfo();
      break;
    case 'settings':
      router.push(`/home/chats/group-settings?groupId=${props.groupId}`);
      break;
    case 'history':
      historyOpen.value = true;
      break;
    case 'report':
      reportModalVisible.value = true;
      break;
    case 'leave':
      handleLeaveGroup();
      break;
  }
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.leftContainer">{{ title }}</div>
    <div :class="styles.rightContainer">
      <a-dropdown :trigger="['click']" placement="bottomRight">
        <template #overlay>
          <a-menu :items="menuItems" @click="onMenuClick" />
        </template>
        <MoreOutlined :class="styles.moreIcon" />
      </a-dropdown>
    </div>
    <ReportModal
      :open="reportModalVisible"
      :target-type="ReportTargetType.GROUP"
      :target-uuid="groupId"
      :target-name="title"
      @close="reportModalVisible = false"
    />
    <ChatHistoryDrawer
      v-if="groupId"
      v-model:open="historyOpen"
      :conversation-id="groupId"
      is-group
      :group-name="title"
    />
  </div>
</template>
