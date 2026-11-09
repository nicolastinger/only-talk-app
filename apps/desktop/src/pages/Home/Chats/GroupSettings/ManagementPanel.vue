<script setup lang="ts">
import { h, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { useBearStore } from '@/stores/app';
import { dissolve_group, quit_group, set_member_role } from '@workspace/services';
import type { GroupMemberVo, GroupVo } from '@workspace/types';
import { Select } from 'ant-design-vue';
import { feedback } from '@/utils/feedback';
import styles from './index.module.less';

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
    title: '退出群聊',
    content: '确定要退出该群聊吗？',
    okText: '确定',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      try {
        await quit_group(props.groupInfo.group_uuid);
        feedback.message.success('已退出群聊');
        router.push('/home/chats/dashboard');
      } catch {
        feedback.message.error('退出群聊失败');
      }
    },
  });
};

const handleDissolve = () => {
  feedback.modal.confirm({
    title: '解散群聊',
    content: `确定要解散"${props.groupInfo.group_name}"吗？此操作不可恢复。`,
    okText: '确定解散',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      try {
        await dissolve_group(props.groupInfo.group_uuid);
        feedback.message.success('群聊已解散');
        router.push('/home/chats/dashboard');
      } catch {
        feedback.message.error('解散群聊失败');
      }
    },
  });
};

const handleTransferOwnership = async () => {
  const membersToTransfer = props.members.filter(
    (m) => m.user_uuid !== store.userInfo?.uuid,
  );
  if (membersToTransfer.length === 0) {
    feedback.message.warning('群内没有其他成员可转让');
    return;
  }

  let selectedUser: string | null = null;

  feedback.modal.confirm({
    title: '转让群主',
    content: h('div', [
      h(
        'div',
        { style: { marginBottom: '8px', color: '#666', fontSize: '13px' } },
        '选择要转让群主的成员：',
      ),
      h(Select as unknown as Component, {
        style: { width: '100%' },
        placeholder: '选择成员',
        onChange: (val: string) => {
          selectedUser = val;
        },
        options: membersToTransfer.map((m) => ({
          label: `${m.nickname || m.user_uuid} (${m.user_uuid})`,
          value: m.user_uuid,
        })),
      }),
    ]),
    okText: '转让',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      if (!selectedUser) {
        feedback.message.warning('请选择要转让的成员');
        return Promise.reject();
      }
      try {
        await set_member_role({
          group_uuid: props.groupInfo.group_uuid,
          user_uuid: selectedUser,
          role: 2,
        });
        feedback.message.success('群主已转让');
        emit('update');
      } catch {
        feedback.message.error('转让失败');
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
        <a-button danger block @click="handleLeaveGroup">退出群聊</a-button>
        <div :class="styles.dangerDesc">退出后将不再收到该群消息</div>
      </div>
    </div>

    <template v-if="isOwner()">
      <div :class="styles.dangerZone">
        <div :class="styles.dangerTitle">群主操作</div>
        <div :class="styles.dangerItem">
          <a-button block @click="handleTransferOwnership">转让群主</a-button>
          <div :class="styles.dangerDesc">
            将群主身份转让给其他成员，自己将降为管理员
          </div>
        </div>
      </div>

      <div style="margin-top: 24px">
        <div :class="styles.dangerZone">
          <div :class="styles.dangerTitle">危险操作</div>
          <div :class="styles.dangerItem">
            <a-button danger block @click="handleDissolve">解散群聊</a-button>
            <div :class="styles.dangerDesc">
              解散后所有群成员将被移出，群消息记录将被清空
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
