<script setup lang="ts">
import { h, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { useBearStore } from '@/stores/app';
import { dissolve_group, quit_group, set_member_role } from '@workspace/services';
import type { GroupMemberVo, GroupVo } from '@workspace/types';
import { Select } from 'ant-design-vue';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();

const props = defineProps<{
  groupInfo: GroupVo;
  members: GroupMemberVo[];
}>();

const emit = defineEmits<{
  (e: 'update'): void;
}>();

const router = useRouter();
const store = useBearStore();
const isOwner = () => props.groupInfo.owner_uuid === store.userInfo?.uuid;

const handleLeaveGroup = () => {
  feedback.modal.confirm({
    title: t('groupSettings.leaveGroup'),
    content: t('groupSettings.leaveGroupConfirm'),
    okText: t('common.confirm'),
    okButtonProps: { danger: true },
    cancelText: t('common.cancel'),
    onOk: async () => {
      try {
        await quit_group(props.groupInfo.group_uuid);
        feedback.message.success(t('groupSettings.leaveGroupSuccess'));
        router.push('/home/chats/dashboard');
      } catch {
        feedback.message.error(t('groupSettings.leaveGroupFailed'));
      }
    },
  });
};

const handleDissolve = () => {
  feedback.modal.confirm({
    title: t('groupSettings.dissolveGroup'),
    content: t('groupSettings.dissolveGroupConfirm', {
      name: props.groupInfo.group_name,
    }),
    okText: t('groupSettings.dissolveGroupBtn'),
    okButtonProps: { danger: true },
    cancelText: t('common.cancel'),
    onOk: async () => {
      try {
        await dissolve_group(props.groupInfo.group_uuid);
        feedback.message.success(t('groupSettings.dissolveGroupSuccess'));
        router.push('/home/chats/dashboard');
      } catch {
        feedback.message.error(t('groupSettings.dissolveGroupFailed'));
      }
    },
  });
};

const handleTransferOwnership = async () => {
  const membersToTransfer = props.members.filter(
    (m) => m.user_uuid !== store.userInfo?.uuid,
  );
  if (membersToTransfer.length === 0) {
    feedback.message.warning(t('groupSettings.noMemberToTransfer'));
    return;
  }

  let selectedUser: string | null = null;

  feedback.modal.confirm({
    title: t('groupSettings.transferOwnership'),
    content: h('div', [
      h(
        'div',
        { style: { marginBottom: '8px', color: '#666', fontSize: '13px' } },
        t('groupSettings.transferOwnershipDesc'),
      ),
      h(Select as unknown as Component, {
        style: { width: '100%' },
        placeholder: t('groupSettings.selectMember'),
        onChange: (val: string) => {
          selectedUser = val;
        },
        options: membersToTransfer.map((m) => ({
          label: `${m.nickname || m.user_uuid} (${m.user_uuid})`,
          value: m.user_uuid,
        })),
      }),
    ]),
    okText: t('groupSettings.transfer'),
    okButtonProps: { danger: true },
    cancelText: t('common.cancel'),
    onOk: async () => {
      if (!selectedUser) {
        feedback.message.warning(t('groupSettings.selectMemberToTransfer'));
        return Promise.reject();
      }
      try {
        await set_member_role({
          group_uuid: props.groupInfo.group_uuid,
          user_uuid: selectedUser,
          role: 2,
        });
        feedback.message.success(t('groupSettings.transferSuccess'));
        emit('update');
      } catch {
        feedback.message.error(t('groupSettings.transferFailed'));
        return Promise.reject();
      }
    },
  });
};
</script>

<template>
  <div>
    <div
      v-if="!isOwner()"
      :class="styles.dangerZone"
      style="border-color: var(--color-warning-bg, #fffbe6); border-style: solid; border-width: 1px"
    >
      <div :class="styles.dangerItem">
        <a-button danger block @click="handleLeaveGroup">
          {{ t('groupSettings.leaveGroup') }}
        </a-button>
        <div :class="styles.dangerDesc">
          {{ t('groupSettings.leaveGroupDesc') }}
        </div>
      </div>
    </div>

    <template v-if="isOwner()">
      <div :class="styles.dangerZone">
        <div :class="styles.dangerTitle">{{ t('groupSettings.ownerZone') }}</div>
        <div :class="styles.dangerItem">
          <a-button block @click="handleTransferOwnership">
            {{ t('groupSettings.transferOwnership') }}
          </a-button>
          <div :class="styles.dangerDesc">
            {{ t('groupSettings.transferOwnershipHint') }}
          </div>
        </div>
      </div>

      <div style="margin-top: 24px">
        <div :class="styles.dangerZone">
          <div :class="styles.dangerTitle">
            {{ t('groupSettings.dangerZone') }}
          </div>
          <div :class="styles.dangerItem">
            <a-button danger block @click="handleDissolve">
              {{ t('groupSettings.dissolveGroup') }}
            </a-button>
            <div :class="styles.dangerDesc">
              {{ t('groupSettings.dissolveGroupDesc') }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
