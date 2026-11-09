<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MoreOutlined, WarningOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { ReportTargetType } from '@workspace/types';
import ReportModal from '@/components/ReportModal/index.vue';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './styles/TopBar.module.less';

const props = defineProps<{
  title: string;
  groupId: string;
  memberCount: number;
}>();

const { t } = useI18n();
const router = useRouter();
const reportModalVisible = ref(false);

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

const menuItems = computed(() => ({
  items: [
    {
      key: 'info',
      label: t('chat.group.groupInfo'),
      onClick: handleViewGroupInfo,
    },
    {
      key: 'settings',
      label: t('chat.group.groupSettings'),
      onClick: () => router.push(`/home/chats/group-settings?groupId=${props.groupId}`),
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
      key: 'leave',
      label: t('chat.group.leaveGroup'),
      danger: true,
      onClick: handleLeaveGroup,
    },
  ],
}));
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.leftContainer">{{ title }}</div>
    <div :class="styles.rightContainer">
      <a-dropdown :menu="menuItems" :trigger="['click']" placement="bottomRight">
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
  </div>
</template>
