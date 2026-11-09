<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useBearStore } from '@/stores/app';
import { MessageOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import {
  get_friend_list,
  getFiles,
  invite_group_members,
  openImagePreviewWindow,
} from '@workspace/services';
import type { FriendVo, GroupMemberStoreVo, GroupVo } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBearStore();

const groupInfo = ref<GroupVo | null>(null);
const members = ref<GroupMemberStoreVo[]>([]);
const groupIcon = ref<string>('');
const loading = ref(true);
const inviteModalOpen = ref(false);
const friendList = ref<FriendVo[]>([]);
const selectedFriends = ref<string[]>([]);
const inviteLoading = ref(false);

const groupId = ref(String(route.query.groupId || ''));
const meUuid = computed(() => store.userInfo.uuid || '');

const loadGroupIcon = async (avatar?: string) => {
  if (!avatar) return;
  try {
    const files = await getFiles(avatar);
    if (files?.[0]?.tauri_file_path) {
      groupIcon.value = files[0].tauri_file_path;
    }
  } catch (e) {
    console.log('获取群头像失败', e);
  }
};

const loadGroupInfo = async () => {
  try {
    const data: GroupVo = await invoke('get_group_info_command', {
      groupId: groupId.value,
    });
    groupInfo.value = data;
    loadGroupIcon(data.avatar);
  } catch (err) {
    console.log('获取群信息失败，尝试本地加载', err);
    try {
      const local: GroupVo[] = await invoke('get_group_list');
      const found = local.find((g) => g.group_uuid === groupId.value);
      if (found) {
        groupInfo.value = found;
        loadGroupIcon(found.avatar);
      }
    } catch (e) {
      console.log('本地获取群信息也失败', e);
    }
  }
};

const loadMembers = async () => {
  loading.value = true;
  try {
    const data: GroupMemberStoreVo[] = await invoke(
      'sync_group_members_command',
      {
        groupId: groupId.value,
      },
    );
    members.value = data;
  } catch (err) {
    console.log('获取成员失败，尝试本地加载', err);
    try {
      const data: GroupMemberStoreVo[] = await invoke('get_group_members', {
        groupId: groupId.value,
      });
      members.value = data;
    } catch (e) {
      console.log('本地获取成员也失败', e);
    }
  } finally {
    loading.value = false;
  }
};

const loadAll = () => {
  loadGroupInfo();
  loadMembers();
};

watch(
  () => route.query.groupId,
  (value) => {
    groupId.value = String(value || '');
    loadAll();
  },
  { immediate: true },
);

const handleLeaveGroup = () => {
  feedback.modal.confirm({
    title: t('groupSettings.leaveGroup'),
    content: t('groupSettings.leaveGroupConfirm'),
    okText: t('groupSettings.members.confirm'),
    cancelText: t('groupSettings.members.cancel'),
    onOk: async () => {
      try {
        await invoke('leave_group_command', { groupId: groupId.value });
        feedback.message.success(t('groupSettings.leaveGroupSuccess'));
        router.push('/home/chats/dashboard');
      } catch (e) {
        feedback.message.error(t('groupSettings.leaveGroupFailed'));
      }
    },
  });
};

const handleStartChat = async () => {
  try {
    await invoke('create_group_chat_session_command', { groupId: groupId.value });
    router.push(`/home/chats/group-chat?groupId=${groupId.value}`);
  } catch (e) {
    console.log('创建群聊会话失败', e);
  }
};

const openInviteModal = async () => {
  try {
    const friends = await get_friend_list();
    const memberIds = new Set(members.value.map((m) => m.user_id));
    const nonMembers = friends.filter((f) => !memberIds.has(f.friend_id));
    friendList.value = nonMembers;
    selectedFriends.value = [];
    inviteModalOpen.value = true;
  } catch (err) {
    console.log('获取好友列表失败', err);
  }
};

const handleInvite = async () => {
  if (selectedFriends.value.length === 0) {
    feedback.message.warning(t('groupSettings.members.selectFriendsToInvite'));
    return;
  }
  inviteLoading.value = true;
  try {
    const invited = await invite_group_members(
      groupId.value,
      selectedFriends.value,
    );
    feedback.message.success(
      t('groupSettings.members.inviteSent', { count: invited.length }),
    );
    inviteModalOpen.value = false;
    loadMembers();
  } catch (err) {
    feedback.message.error(t('groupSettings.members.inviteFailed'));
  } finally {
    inviteLoading.value = false;
  }
};

const isOwner = () => groupInfo.value?.owner_uuid === meUuid.value;
const isAdmin = () =>
  members.value.some((m) => m.user_id === meUuid.value && m.role >= 1);

// 参与成员信息查询的成员（保持响应式，供 useGroupMemberInfo 追踪）
const memberUuids = reactive<string[]>([]);
watch(
  members,
  (list) => {
    const ids = list.map((m) => m.user_id).filter(Boolean);
    memberUuids.splice(0, memberUuids.length, ...ids);
  },
  { immediate: true },
);
const { memberInfoMap } = useGroupMemberInfo(memberUuids);

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};

const handleAvatarClick = () => {
  if (groupIcon.value) openImagePreviewWindow([groupIcon.value], 0);
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.content">
      <div :class="styles.cover" />

      <div :class="styles.header">
        <div :class="styles.avatarWrap">
          <img
            :class="styles.icon"
            :src="groupIcon || DEFAULT_ICON"
            alt="group avatar"
            @click="handleAvatarClick"
            @error="handleImgError"
          />
        </div>
        <div :class="styles.name">{{ groupInfo?.group_name || '-' }}</div>
        <div :class="styles.metaChips">
          <span :class="styles.chip">
            <TeamOutlined />
            {{ groupInfo?.member_count ?? members.length }}
            {{ t('groupInfo.members') }}
          </span>
        </div>

        <div :class="styles.actions">
          <a-button
            :class="styles.primaryBtn"
            type="primary"
            @click="handleStartChat"
          >
            <template #icon><MessageOutlined /></template>
            {{ t('groupInfo.enterGroupChat') }}
          </a-button>
          <a-button v-if="isOwner() || isAdmin()" @click="openInviteModal">
            {{ t('groupSettings.members.inviteMember') }}
          </a-button>
          <a-button
            v-if="isOwner() || isAdmin()"
            @click="router.push(`/home/chats/group-settings?groupId=${groupId}`)"
          >
            {{ t('groupSettings.title') }}
          </a-button>
          <a-button v-if="!isOwner()" danger @click="handleLeaveGroup">
            {{ t('groupSettings.leaveGroup') }}
          </a-button>
        </div>
      </div>

      <div :class="styles.memberSection">
        <div :class="styles.sectionTitle">
          <TeamOutlined />
          {{ t('groupSettings.groupMembers') }} ({{ members.length }})
        </div>
        <div v-if="loading" :class="styles.loadingState">
          <a-spin />
        </div>
        <a-list v-else :data-source="members">
          <template #renderItem="{ item: member }">
            <a-list-item :class="styles.memberItem">
              <div :class="styles.memberInfo">
                <a-avatar
                  :size="36"
                  :src="memberInfoMap.get(member.user_id)?.icon || member.icon"
                >
                  <template #icon><UserOutlined /></template>
                </a-avatar>
                <div :class="styles.memberDetail">
                  <span :class="styles.memberName">
                    {{
                      memberInfoMap.get(member.user_id)?.username ||
                      member.nickname ||
                      member.user_id
                    }}
                    <UserTypeTag :type="memberInfoMap.get(member.user_id)?.user_type" />
                  </span>
                  <span :class="styles.memberSub">
                    {{
                      member.user_id === meUuid
                        ? t('groupSettings.members.me')
                        : member.user_id
                    }}
                  </span>
                </div>
                <span
                  v-if="member.role === 2"
                  :class="[styles.roleTag, styles.ownerTag]"
                >
                  {{ t('groupSettings.members.owner') }}
                </span>
                <span
                  v-if="member.role === 1"
                  :class="[styles.roleTag, styles.adminTag]"
                >
                  {{ t('groupSettings.members.admin') }}
                </span>
              </div>
            </a-list-item>
          </template>
        </a-list>
      </div>
    </div>

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
      <div style="margin-bottom: 12px; color: #666">
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
