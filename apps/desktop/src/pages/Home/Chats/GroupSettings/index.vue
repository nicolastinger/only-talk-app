<script setup lang="ts">
import { computed, h, reactive, ref, watch, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import {
  CROP_CANCELLED_ERROR,
  useAvatarCropper,
} from '@/hooks/useAvatarCropper';
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { useUserInfoList } from '@/hooks/useUserInfoList';
import { useBearStore } from '@/stores/app';
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CopyOutlined,
  EditOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { Select } from 'ant-design-vue';
import {
  convertPathToTauriUrl,
  dissolve_group,
  get_friend_list,
  get_group_info,
  get_group_members,
  getApiBase,
  getFiles,
  invite_group_members,
  isBackendSuccess,
  isHttpSuccess,
  openImagePreviewWindow,
  quit_group,
  remove_group_member,
  selectFile,
  set_member_role,
  update_group,
} from '@workspace/services';
import type { FriendVo, GroupInfoVo, GroupMemberVo } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBearStore();

const groupId = ref(String(route.query.groupId || ''));
const userInfo = computed(() => store.userInfo);
const { startCrop } = useAvatarCropper();

const ROLE_TEXT = computed<Record<number, string>>(() => ({
  2: t('groupSettings.members.owner'),
  1: t('groupSettings.members.admin'),
  0: t('groupSettings.members.member'),
}));

const groupInfo = ref<GroupInfoVo | null>(null);
const members = ref<GroupMemberVo[]>([]);
const loading = ref(true);
const avatarUploading = ref(false);
const avatarUrl = ref<string | null>(null);

// Basic settings state
const editingName = ref(false);
const editingDesc = ref(false);
const groupName = ref('');
const groupDesc = ref('');
const saving = ref(false);

// Members state
const searchText = ref('');
const inviteModalOpen = ref(false);
const friendList = ref<FriendVo[]>([]);
const selectedFriends = ref<string[]>([]);
const inviteLoading = ref(false);

// 管理权限与数据加载函数被下方 watch / 事件回调引用, 提前声明
const isOwner = computed(() => groupInfo.value?.owner_uuid === userInfo.value?.uuid);
const isAdmin = computed(() =>
  members.value.some(
    (m) => m.user_uuid === userInfo.value?.uuid && m.role >= 1,
  ),
);
const canManage = computed(() => isOwner.value || isAdmin.value);

const loadData = async () => {
  loading.value = true;
  try {
    const [info, memberList] = await Promise.allSettled([
      get_group_info(groupId.value),
      get_group_members(groupId.value),
    ]);
    if (info.status === 'fulfilled') {
      groupInfo.value = info.value;
      groupName.value = info.value.group_name;
      groupDesc.value = info.value.description || '';
      if (info.value.avatar) {
        const files = await getFiles(info.value.avatar);
        avatarUrl.value = files?.[0]?.tauri_file_path || null;
      } else {
        avatarUrl.value = null;
      }
      // HTTP 群信息拿到后按群 uuid 定向回写本地 sqlite 群组表, 防列表/会话入口显示旧数据
      invoke('update_group_profile_command', {
        groupId: info.value.group_uuid,
        groupName: info.value.group_name,
        avatar: info.value.avatar || '',
        ownerUuid: info.value.owner_uuid,
        memberCount: info.value.member_count,
        createdAt: info.value.created_at,
      }).catch((err) => console.log('回写群资料到本地失败', err));
    }
    if (memberList.status === 'fulfilled') {
      members.value = memberList.value || [];
    }
  } catch (error) {
    console.error(t('groupSettings.loadFailed'), error);
  } finally {
    loading.value = false;
  }
};

watch(
  groupId,
  (value) => {
    if (value) {
      loadData();
    }
  },
  { immediate: true },
);

const handleAvatarClick = async () => {
  if (!canManage.value || avatarUploading.value) return;
  try {
    const files = await selectFile(false);
    if (!files || files.length === 0) return;

    const filePath = files[0];

    const croppedPath = await startCrop(filePath);

    avatarUploading.value = true;

    const preview = convertPathToTauriUrl(croppedPath);
    if (preview) {
      avatarUrl.value = preview;
    }

    const uploadResult = await invoke<{ status: number; body: string }>(
      'upload_file_request',
      {
        url: `${getApiBase()}/file_integrated/upload/group_avatar/${
          groupInfo.value!.group_uuid
        }`,
        filePath: croppedPath,
        fieldName: 'file',
      },
    );

    if (isHttpSuccess(uploadResult.status)) {
      const responseBody = uploadResult.body
        ? JSON.parse(uploadResult.body)
        : null;
      if (
        responseBody &&
        isBackendSuccess(responseBody.code) &&
        responseBody.data
      ) {
        const bizId = responseBody.data;
        const FileVos = await getFiles(bizId);
        const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

        if (tauriFilePath) {
          groupInfo.value = { ...groupInfo.value!, avatar: bizId };
          avatarUrl.value = tauriFilePath;
          feedback.message.success(t('groupSettings.avatar.updateSuccess'));
        } else {
          feedback.message.error(t('groupSettings.avatar.getFileFailed'));
        }
      } else {
        feedback.message.error(
          responseBody?.msg || t('groupSettings.avatar.uploadFailed'),
        );
      }
    } else {
      feedback.message.error(t('groupSettings.avatar.uploadFailed'));
    }
  } catch (error) {
    if (error instanceof Error && error.message === CROP_CANCELLED_ERROR) {
      return;
    }
    console.error(t('groupSettings.avatar.updateFailed'), error);
    feedback.message.error(
      (error instanceof Error ? error.message : String(error)) ||
        t('groupSettings.avatar.updateFailed'),
    );
  } finally {
    avatarUploading.value = false;
  }
};

// 参与成员信息查询的成员（保持响应式，供 useUserInfoList 追踪）
const memberUuids = reactive<string[]>([]);
watch(
  members,
  (list) => {
    const ids = list.map((m) => m.user_uuid).filter(Boolean);
    memberUuids.splice(0, memberUuids.length, ...ids);
  },
  { immediate: true },
);
const { userInfoMap: memberInfoMap } = useUserInfoList(memberUuids);

// 收集所有成员的 icon bizId，批量转换为可用的头像 URL
const memberIconBizIds = reactive<string[]>([]);
watch(
  [members, memberInfoMap],
  () => {
    const ids: string[] = [];
    for (const member of members.value) {
      const info = memberInfoMap.value.get(member.user_uuid);
      const bizId = info?.icon;
      if (bizId) ids.push(bizId);
    }
    memberIconBizIds.splice(0, memberIconBizIds.length, ...ids);
  },
  { immediate: true },
);
const { avatarMap } = useAvatarMap(memberIconBizIds);

const filteredMembers = computed(() =>
  members.value.filter((m) => {
    const keyword = searchText.value.toLowerCase();
    const info = memberInfoMap.value.get(m.user_uuid);
    return (
      (info?.username || '').toLowerCase().includes(keyword) ||
      (info?.account || '').toLowerCase().includes(keyword) ||
      m.user_uuid.toLowerCase().includes(keyword)
    );
  }),
);

// Basic settings handlers
const handleSaveName = async () => {
  if (!groupName.value.trim()) {
    feedback.message.warning(t('groupSettings.nameRequired'));
    return;
  }
  saving.value = true;
  try {
    await update_group({
      group_uuid: groupInfo.value!.group_uuid,
      group_name: groupName.value.trim(),
      description: groupDesc.value,
    });
    feedback.message.success(t('groupSettings.saveSuccess'));
    editingName.value = false;
    loadData();
  } catch {
    feedback.message.error(t('groupSettings.saveFailed'));
  } finally {
    saving.value = false;
  }
};

const handleSaveDesc = async () => {
  saving.value = true;
  try {
    await update_group({
      group_uuid: groupInfo.value!.group_uuid,
      group_name: groupName.value,
      description: groupDesc.value.trim(),
    });
    feedback.message.success(t('groupSettings.saveSuccess'));
    editingDesc.value = false;
    loadData();
  } catch {
    feedback.message.error(t('groupSettings.saveFailed'));
  } finally {
    saving.value = false;
  }
};

// Members handlers
const loadFriends = async () => {
  try {
    const friends = await get_friend_list();
    const memberIds = new Set(members.value.map((m) => m.user_uuid));
    friendList.value = friends.filter((f) => !memberIds.has(f.friend_id));
    selectedFriends.value = [];
  } catch {
    feedback.message.error(t('groupSettings.members.getFriendListFailed'));
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
      groupInfo.value!.group_uuid,
      selectedFriends.value,
    );
    feedback.message.success(
      t('groupSettings.members.inviteSent', { count: invited.length }),
    );
    inviteModalOpen.value = false;
    loadData();
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
        await remove_group_member(groupInfo.value!.group_uuid, member.user_uuid);
        feedback.message.success(
          t('groupSettings.members.removeMemberSuccess'),
        );
        loadData();
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
      group_uuid: groupInfo.value!.group_uuid,
      user_uuid: member.user_uuid,
      role,
    });
    feedback.message.success(
      role === 1
        ? t('groupSettings.members.setAdminSuccess')
        : t('groupSettings.members.removeAdminSuccess'),
    );
    loadData();
  } catch {
    feedback.message.error(t('groupSettings.members.setRoleFailed'));
  }
};

// Management handlers
const handleLeaveGroup = () => {
  feedback.modal.confirm({
    title: t('groupSettings.leaveGroup'),
    content: t('groupSettings.leaveGroupConfirm'),
    okText: t('groupSettings.members.confirm'),
    okButtonProps: { danger: true },
    cancelText: t('groupSettings.members.cancel'),
    onOk: async () => {
      try {
        await quit_group(groupInfo.value!.group_uuid);
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
      name: groupInfo.value?.group_name,
    }),
    okText: t('groupSettings.dissolveGroupBtn'),
    okButtonProps: { danger: true },
    cancelText: t('groupSettings.members.cancel'),
    onOk: async () => {
      try {
        await dissolve_group(groupInfo.value!.group_uuid);
        feedback.message.success(t('groupSettings.dissolveGroupSuccess'));
        router.push('/home/chats/dashboard');
      } catch {
        feedback.message.error(t('groupSettings.dissolveGroupFailed'));
      }
    },
  });
};

const handleTransferOwnership = async () => {
  const membersToTransfer = members.value.filter(
    (m) => m.user_uuid !== userInfo.value?.uuid,
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
          label: `${memberInfoMap.value.get(m.user_uuid)?.username || m.user_uuid} (${m.user_uuid})`,
          value: m.user_uuid,
        })),
      }),
    ]),
    okText: t('groupSettings.transfer'),
    okButtonProps: { danger: true },
    cancelText: t('groupSettings.members.cancel'),
    onOk: async () => {
      if (!selectedUser) {
        feedback.message.warning(t('groupSettings.selectMemberToTransfer'));
        return Promise.reject();
      }
      try {
        await set_member_role({
          group_uuid: groupInfo.value!.group_uuid,
          user_uuid: selectedUser,
          role: 2,
        });
        feedback.message.success(t('groupSettings.transferSuccess'));
        loadData();
      } catch {
        feedback.message.error(t('groupSettings.transferFailed'));
        return Promise.reject();
      }
    },
  });
};

const copyGroupId = () => {
  if (groupInfo.value?.group_uuid) {
    navigator.clipboard
      .writeText(groupInfo.value.group_uuid)
      .then(() => {
        feedback.message.success(t('groupSettings.groupIdCopied'));
      })
      .catch(() => {
        feedback.message.error(t('groupSettings.copyFailed'));
      });
  }
};

// Management action items
const managementItems = computed(() => [
  {
    label: t('groupSettings.groupId'),
    value: groupInfo.value?.group_uuid,
    icon: CopyOutlined,
    onClick: copyGroupId,
    showArrow: true,
  },
  {
    label: t('groupSettings.members.owner'),
    value: (() => {
      const owner = members.value.find((m) => m.role === 2);
      return owner
        ? memberInfoMap.value.get(owner.user_uuid)?.username || owner.user_uuid
        : '-';
    })(),
    icon: SafetyCertificateOutlined,
  },
  {
    label: t('groupSettings.createdAt'),
    value: groupInfo.value?.created_at
      ? new Date(groupInfo.value.created_at).toLocaleDateString('zh-CN')
      : '-',
    icon: null,
  },
]);

type MemberAction = {
  label: string;
  /** 危险操作：红色文字 */
  danger?: boolean;
  onClick: () => void;
};

const getMemberActions = (member: GroupMemberVo): MemberAction[] => {
  const actions: MemberAction[] = [];
  const isSelf = member.user_uuid === userInfo.value?.uuid;
  if (!isSelf && isOwner.value) {
    if (member.role === 0) {
      actions.push({
        label: t('groupSettings.members.setAdmin'),
        onClick: () => handleSetRole(member, 1),
      });
    }
    if (member.role === 1) {
      actions.push({
        label: t('groupSettings.members.removeAdmin'),
        onClick: () => handleSetRole(member, 0),
      });
    }
    actions.push({
      label: t('groupSettings.members.removeMember'),
      danger: true,
      onClick: () => handleKick(member),
    });
  } else if (!isSelf && isAdmin.value && member.role === 0) {
    actions.push({
      label: t('groupSettings.members.removeMember'),
      danger: true,
      onClick: () => handleKick(member),
    });
  }
  return actions;
};

const handleBack = () => {
  router.back();
};
</script>

<template>
  <div v-if="loading" :class="styles.loadingContainer">
    <div :class="styles.loadingText">
      {{ t('groupSettings.loading') }}
    </div>
  </div>
  <div v-else-if="groupInfo" :class="styles.container">
    <div :class="styles.header">
      <span :class="styles.backBtn" @click="handleBack">
        <ArrowLeftOutlined />
      </span>
      <span :class="styles.headerTitle">
        {{ t('groupSettings.title') }}
      </span>
      <span style="width: 32px" />
    </div>

    <div :class="styles.scrollContent">
      <!-- Group avatar and name section -->
      <div :class="styles.groupHeader">
        <div
          :class="styles.avatarWrapper"
          :style="{ cursor: avatarUrl ? 'pointer' : 'default' }"
          @click="avatarUrl && openImagePreviewWindow([avatarUrl], 0)"
        >
          <a-spin :spinning="avatarUploading">
            <template #indicator>
              <LoadingOutlined style="font-size: 24px" spin />
            </template>
            <a-avatar
              :size="72"
              shape="square"
              :src="avatarUrl || DEFAULT_ICON"
              :class="styles.groupAvatar"
            />
          </a-spin>
          <div
            v-if="canManage && !avatarUploading"
            :class="styles.avatarOverlay"
            @click.stop="handleAvatarClick"
          >
            <CameraOutlined style="font-size: 20px; color: #fff" />
          </div>
        </div>
        <div :class="styles.groupNameSection">
          <div v-if="editingName" :class="styles.editNameRow">
            <a-input
              v-model:value="groupName"
              autofocus
              :maxlength="50"
              :class="styles.nameInput"
              @press-enter="handleSaveName"
            />
            <a-button type="primary" size="small" :loading="saving" @click="handleSaveName">
              {{ t('groupSettings.members.confirm') }}
            </a-button>
            <a-button
              size="small"
              @click="
                () => {
                  editingName = false;
                  groupName = groupInfo?.group_name || '';
                }
              "
            >
              {{ t('groupSettings.members.cancel') }}
            </a-button>
          </div>
          <div v-else :class="styles.nameRow">
            <span :class="styles.groupName">{{ groupInfo.group_name }}</span>
            <a-button
              v-if="canManage"
              type="text"
              size="small"
              @click="editingName = true"
            >
              <template #icon><EditOutlined /></template>
            </a-button>
          </div>
          <div :class="styles.memberCount">
            <TeamOutlined />
            {{ t('groupSettings.members.memberCount', { count: members.length }) }}
          </div>
        </div>
      </div>

      <!-- Description -->
      <div v-if="editingDesc" :class="styles.descEditSection">
        <a-textarea
          v-model:value="groupDesc"
          :rows="3"
          :maxlength="200"
          show-count
          autofocus
        />
        <div :class="styles.descEditActions">
          <a-button type="primary" size="small" :loading="saving" @click="handleSaveDesc">
            {{ t('groupSettings.members.confirm') }}
          </a-button>
          <a-button
            size="small"
            @click="
              () => {
                editingDesc = false;
                groupDesc = groupInfo?.description || '';
              }
            "
          >
            {{ t('groupSettings.members.cancel') }}
          </a-button>
        </div>
      </div>
      <div
        v-else-if="groupInfo.description"
        :class="styles.descSection"
        @click="canManage && (editingDesc = true)"
      >
        <span :class="styles.descText">{{ groupInfo.description }}</span>
        <EditOutlined v-if="canManage" :class="styles.descEditIcon" />
      </div>
      <div v-else-if="canManage" :class="styles.descEmpty" @click="editingDesc = true">
        <span>{{ t('groupSettings.addDescription') }}</span>
        <EditOutlined :class="styles.descEditIcon" />
      </div>

      <!-- Group info items -->
      <div :class="styles.section">
        <div :class="styles.sectionTitle">
          {{ t('groupSettings.groupInfo') }}
        </div>
        <div :class="styles.infoList">
          <div
            v-for="item in managementItems"
            :key="item.label"
            :class="styles.infoItem"
            @click="item.onClick"
          >
            <span v-if="item.icon" :class="styles.infoIcon">
              <component :is="item.icon" />
            </span>
            <span :class="styles.infoLabel">{{ item.label }}</span>
            <span :class="styles.infoValue">{{ item.value }}</span>
            <span v-if="item.showArrow" :class="styles.arrow">&rsaquo;</span>
          </div>
        </div>
      </div>

      <!-- Full member list -->
      <div :class="styles.section" id="memberListSection">
        <div :class="styles.memberListHeader">
          <div :class="styles.sectionTitle">
            {{ t('groupSettings.allMembers') }}
          </div>
          <a-button
            v-if="canManage"
            type="primary"
            size="small"
            @click="
              () => {
                loadFriends();
                inviteModalOpen = true;
              }
            "
          >
            <template #icon><UserAddOutlined /></template>
            {{ t('groupSettings.add') }}
          </a-button>
        </div>
        <a-input-search
          v-model:value="searchText"
          :placeholder="t('groupSettings.members.searchMember')"
          :class="styles.memberSearch"
          allow-clear
        >
          <template #prefix>
            <SearchOutlined style="color: #bbb" />
          </template>
        </a-input-search>
        <div>
          <div
            v-for="member in filteredMembers"
            :key="member.user_uuid"
            :class="styles.memberListItem"
          >
            <div :class="styles.memberListItemInfo">
              <a-avatar
                :size="36"
                :src="
                  (memberInfoMap.get(member.user_uuid)?.icon
                    ? avatarMap.get(memberInfoMap.get(member.user_uuid)!.icon!)
                    : undefined) || DEFAULT_ICON
                "
              >
                <template #icon><UserOutlined /></template>
              </a-avatar>
              <div :class="styles.memberTextInfo">
                <div>
                  <span :class="styles.memberListItemName">
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
                    v-if="member.user_uuid === userInfo?.uuid"
                    style="margin-left: 4px"
                    color="blue"
                  >
                    {{ t('groupSettings.members.me') }}
                  </a-tag>
                </div>
                <span :class="styles.memberItemId">
                  {{ memberInfoMap.get(member.user_uuid)?.account || member.user_uuid }}
                </span>
              </div>
            </div>
            <div v-if="getMemberActions(member).length > 0" :class="styles.memberActions">
              <a-button
                v-for="(action, idx) in getMemberActions(member)"
                :key="idx"
                type="text"
                size="small"
                :danger="action.danger"
                :class="styles.actionBtn"
                @click="action.onClick"
              >
                {{ action.label }}
              </a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- Danger zone -->
      <div :class="styles.section">
        <a-button
          v-if="!isOwner"
          danger
          block
          :class="styles.dangerBtn"
          @click="handleLeaveGroup"
        >
          {{ t('groupSettings.leaveGroup') }}
        </a-button>
        <template v-if="isOwner">
          <a-button block :class="styles.transferBtn" @click="handleTransferOwnership">
            {{ t('groupSettings.transferOwnership') }}
          </a-button>
          <div style="height: 12px" />
          <a-button danger block :class="styles.dangerBtn" @click="handleDissolve">
            {{ t('groupSettings.dissolveGroup') }}
          </a-button>
        </template>
      </div>

      <div style="height: 40px" />
    </div>

    <!-- Invite Modal -->
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
