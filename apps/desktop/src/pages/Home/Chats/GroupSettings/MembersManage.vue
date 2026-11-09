<script setup lang="ts">
import { computed, h, reactive, ref, watch } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useBearStore } from '@/stores/app';
import { MoreOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import {
  invite_group_members,
  remove_group_member,
  set_member_role,
} from '@workspace/services';
import type { FriendVo, GroupInfoVo, GroupMemberVo } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const props = defineProps<{
  groupInfo: GroupInfoVo;
  members: GroupMemberVo[];
}>();

const emit = defineEmits<{
  (e: 'update'): void;
}>();

const { t } = useI18n();
const store = useBearStore();

const ROLE_TEXT = computed<Record<number, string>>(() => ({
  2: t('groupSettings.members.owner'),
  1: t('groupSettings.members.admin'),
  0: t('groupSettings.members.member'),
}));

const searchText = ref('');
const inviteModalOpen = ref(false);
const friendList = ref<FriendVo[]>([]);
const selectedFriends = ref<string[]>([]);
const inviteLoading = ref(false);

const isOwner = () => props.groupInfo.owner_uuid === store.userInfo?.uuid;
const isAdmin = () =>
  props.members.some(
    (m) => m.user_uuid === store.userInfo?.uuid && m.role >= 1,
  );
const canManage = () => isOwner() || isAdmin();

// 参与成员信息查询的成员（保持响应式，供 useGroupMemberInfo 追踪）
const memberUuids = reactive<string[]>([]);
watch(
  () => props.members,
  (list) => {
    const ids = list.map((m) => m.user_uuid).filter(Boolean);
    memberUuids.splice(0, memberUuids.length, ...ids);
  },
  { immediate: true },
);
const { memberInfoMap } = useGroupMemberInfo(memberUuids);

// 收集所有成员的 icon bizId，批量转换为可用的头像 URL
const memberIconBizIds = reactive<string[]>([]);
watch(
  [() => props.members, memberInfoMap],
  () => {
    const ids: string[] = [];
    for (const member of props.members) {
      const info = memberInfoMap.value.get(member.user_uuid);
      const bizId = info?.icon;
      if (bizId) ids.push(bizId);
    }
    memberIconBizIds.splice(0, memberIconBizIds.length, ...ids);
  },
  { immediate: true },
);
const { avatarMap } = useAvatarMap(memberIconBizIds);

const loadFriends = async () => {
  try {
    const friends: FriendVo[] = await invoke('get_friend_list');
    const memberIds = new Set(props.members.map((m) => m.user_uuid));
    friendList.value = friends.filter((f) => !memberIds.has(f.friend_id));
    selectedFriends.value = [];
  } catch {
    feedback.message.error(t('groupSettings.members.getFriendListFailed'));
  }
};

watch(
  inviteModalOpen,
  (open) => {
    if (open) {
      loadFriends();
    }
  },
);

const handleInvite = async () => {
  if (selectedFriends.value.length === 0) {
    feedback.message.warning(t('groupSettings.members.selectFriendsToInvite'));
    return;
  }
  inviteLoading.value = true;
  try {
    const invited = await invite_group_members(
      props.groupInfo.group_uuid,
      selectedFriends.value,
    );
    feedback.message.success(
      t('groupSettings.members.inviteSent', { count: invited.length }),
    );
    inviteModalOpen.value = false;
    emit('update');
  } catch {
    feedback.message.error(t('groupSettings.members.inviteFailed'));
  } finally {
    inviteLoading.value = false;
  }
};

const handleKick = (member: GroupMemberVo) => {
  feedback.modal.confirm({
    title: t('groupSettings.members.removeMember'),
    content: t('groupSettings.members.removeMemberConfirm', {
      name: memberInfoMap.value.get(member.user_uuid)?.username || member.user_uuid,
    }),
    okText: t('groupSettings.members.confirm'),
    okButtonProps: { danger: true },
    cancelText: t('groupSettings.members.cancel'),
    onOk: async () => {
      try {
        await remove_group_member(props.groupInfo.group_uuid, member.user_uuid);
        feedback.message.success(
          t('groupSettings.members.removeMemberSuccess'),
        );
        emit('update');
      } catch {
        feedback.message.error(
          t('groupSettings.members.removeMemberFailed'),
        );
      }
    },
  });
};

const handleSetRole = async (member: GroupMemberVo, role: number) => {
  try {
    await set_member_role({
      group_uuid: props.groupInfo.group_uuid,
      user_uuid: member.user_uuid,
      role,
    });
    feedback.message.success(
      role === 1
        ? t('groupSettings.members.setAdminSuccess')
        : t('groupSettings.members.removeAdminSuccess'),
    );
    emit('update');
  } catch {
    feedback.message.error(t('groupSettings.members.setRoleFailed'));
  }
};

const getMemberActions = (member: GroupMemberVo) => {
  const items: Array<{
    key: string;
    label: string | ReturnType<typeof h>;
    onClick: () => void;
  }> = [];
  const isSelf = member.user_uuid === store.userInfo?.uuid;

  if (isSelf) {
    return [];
  }

  if (isOwner()) {
    if (member.role === 0) {
      items.push({
        key: 'admin',
        label: t('groupSettings.members.setAdmin'),
        onClick: () => handleSetRole(member, 1),
      });
    }
    if (member.role === 1) {
      items.push({
        key: 'member',
        label: t('groupSettings.members.removeAdmin'),
        onClick: () => handleSetRole(member, 0),
      });
    }
    items.push({
      key: 'kick',
      label: h(
        'span',
        { style: { color: 'var(--color-error)' } },
        t('groupSettings.members.removeMember'),
      ),
      onClick: () => handleKick(member),
    });
  } else if (isAdmin() && member.role === 0) {
    items.push({
      key: 'kick',
      label: h(
        'span',
        { style: { color: 'var(--color-error)' } },
        t('groupSettings.members.removeMember'),
      ),
      onClick: () => handleKick(member),
    });
  }

  return items;
};

const filteredMembers = computed(() =>
  props.members.filter((m) => {
    const keyword = searchText.value.toLowerCase();
    const info = memberInfoMap.value.get(m.user_uuid);
    return (
      (info?.username || '').toLowerCase().includes(keyword) ||
      (info?.account || '').toLowerCase().includes(keyword) ||
      m.user_uuid.toLowerCase().includes(keyword)
    );
  }),
);
</script>

<template>
  <div>
    <div :class="styles.memberListHeader">
      <span>
        {{ t('groupSettings.members.memberCount', { count: members.length }) }}
      </span>
      <a-button v-if="canManage()" type="primary" @click="inviteModalOpen = true">
        <template #icon><PlusOutlined /></template>
        {{ t('groupSettings.members.inviteMember') }}
      </a-button>
    </div>

    <a-input-search
      v-model:value="searchText"
      :placeholder="t('groupSettings.members.searchMember')"
      style="margin-bottom: 16px"
      allow-clear
    />

    <a-list :data-source="filteredMembers">
      <template #renderItem="{ item: member }">
        <div :class="styles.memberItem">
          <div :class="styles.memberInfo">
            <a-avatar
              :size="32"
              :src="
                (memberInfoMap.get(member.user_uuid)?.icon
                  ? avatarMap.get(memberInfoMap.get(member.user_uuid)?.icon || '')
                  : undefined) || DEFAULT_ICON
              "
            >
              <template #icon><UserOutlined /></template>
            </a-avatar>
            <div>
              <div>
                <span :class="styles.memberName">
                  {{
                    memberInfoMap.get(member.user_uuid)?.username ||
                    member.nickname ||
                    member.user_uuid
                  }}
                </span>
                <UserTypeTag :type="memberInfoMap.get(member.user_uuid)?.user_type" />
                <span
                  v-if="member.role > 0"
                  :class="[
                    styles.roleTag,
                    member.role === 2 ? styles.roleOwner : styles.roleAdmin,
                  ]"
                >
                  {{ ROLE_TEXT[member.role] }}
                </span>
                <a-tag
                  v-if="member.user_uuid === store.userInfo?.uuid"
                  style="margin-left: 4px"
                  color="blue"
                >
                  {{ t('groupSettings.members.me') }}
                </a-tag>
              </div>
              <span :class="styles.memberId">
                {{ memberInfoMap.get(member.user_uuid)?.account || member.user_uuid }}
              </span>
            </div>
          </div>
          <a-dropdown
            v-if="getMemberActions(member).length > 0"
            :menu="{ items: getMemberActions(member) }"
            placement="bottomRight"
            :trigger="['click']"
          >
            <a-button type="text" size="small">
              <template #icon><MoreOutlined /></template>
            </a-button>
          </a-dropdown>
        </div>
      </template>
    </a-list>

    <a-modal
      :title="t('groupSettings.members.inviteMember')"
      :open="inviteModalOpen"
      :closable="false"
      :confirm-loading="inviteLoading"
      :ok-text="t('groupSettings.members.invite')"
      :cancel-text="t('groupSettings.members.cancel')"
      @ok="handleInvite"
      @cancel="inviteModalOpen = false"
    >
      <div style="margin-bottom: 12px; color: #666; font-size: 13px">
        {{ t('groupSettings.members.inviteDesc') }}
      </div>
      <a-select
        v-model:value="selectedFriends"
        mode="multiple"
        style="width: 100%"
        :placeholder="t('groupSettings.members.selectFriend')"
        :options="
          friendList.map((f) => ({
            label: f.friend_name || f.friend_id,
            value: f.friend_id,
          }))
        "
      />
    </a-modal>
  </div>
</template>
