<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  CalendarOutlined,
  IdcardOutlined,
  MessageOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  create_group_chat_session,
  get_group_info,
  get_group_members,
  getFiles,
  openImagePreviewWindow,
} from '@workspace/services';
import type { GroupInfoVo, GroupMemberVo, GroupVo } from '@workspace/types';
import styles from './styles/GroupInfo.module.less';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBearStore();

const groupId = computed(() => (route.query.groupId as string) || '');

const groupInfo = ref<GroupInfoVo | null>(null);
const members = ref<GroupMemberVo[]>([]);
const groupIcon = ref<string>('');
const loading = ref(false);

const memberUuids = reactive<string[]>([]);
const { memberInfoMap } = useGroupMemberInfo(memberUuids);

const loadGroupInfo = async () => {
  loading.value = true;
  // 1) 先用本地 sqlite 群组行秒开资料卡, 再 HTTP 拉权威数据覆盖
  try {
    const localGroups: GroupVo[] = await invoke('get_group_list');
    const local = localGroups.find((g) => g.group_uuid === groupId.value);
    if (local) {
      groupInfo.value = local as unknown as GroupInfoVo;
      if (local.avatar) {
        const files = await getFiles(local.avatar).catch(() => []);
        if (files?.[0]?.tauri_file_path) {
          groupIcon.value = files[0].tauri_file_path;
        }
      }
    }
  } catch (error) {
    console.error('读取本地群组信息失败', error);
  }
  // 2) HTTP 获取最新群信息, 并按群 uuid 定向回写本地 sqlite 群组表
  try {
    const info = await get_group_info(groupId.value);
    groupInfo.value = info;
    if (info.avatar) {
      const files = await getFiles(info.avatar);
      if (files?.[0]?.tauri_file_path) {
        groupIcon.value = files[0].tauri_file_path;
      }
    }
    invoke('update_group_profile_command', {
      groupId: info.group_uuid,
      groupName: info.group_name,
      avatar: info.avatar || '',
      ownerUuid: info.owner_uuid,
      memberCount: info.member_count,
      createdAt: info.created_at,
    }).catch((err) => console.log('回写群资料到本地失败', err));
  } catch (error) {
    console.error('获取群组信息失败', error);
    feedback.message.error(t('groupInfo.loadError'));
  } finally {
    loading.value = false;
  }
};

const loadMembers = async () => {
  try {
    const memberList = await get_group_members(groupId.value);
    members.value = memberList || [];
    memberUuids.splice(
      0,
      memberUuids.length,
      ...(memberList || []).map((m) => m.user_uuid).filter(Boolean),
    );
  } catch (error) {
    console.error('获取群成员失败', error);
  }
};

watch(
  groupId,
  (id) => {
    if (id) {
      loadGroupInfo();
      loadMembers();
    }
  },
  { immediate: true },
);

const routeToChat = async () => {
  try {
    await create_group_chat_session(groupId.value);
    router.push('/home/chats/group-chat?groupId=' + groupId.value);
  } catch (err) {
    console.log(err);
    feedback.message.error(t('groupInfo.createSessionError'));
  }
};

const isOwner = computed(
  () => groupInfo.value?.owner_uuid === store.userInfo?.uuid,
);

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN');
};

const getRoleName = (role: number) => {
  switch (role) {
    case 2:
      return t('groupSettings.members.owner');
    case 1:
      return t('groupSettings.members.admin');
    default:
      return t('groupSettings.members.member');
  }
};

const getMemberInfo = (uuid: string) => memberInfoMap.value.get(uuid);

const getMemberDisplayName = (member: GroupMemberVo) => {
  const info = getMemberInfo(member.user_uuid);
  return info?.username || member.nickname || member.user_uuid;
};

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div v-if="loading && !groupInfo" :class="styles.loadingContainer">
    <a-spin size="large" />
  </div>

  <div v-else :class="styles.container">
    <div :class="styles.content">
      <div :class="styles.cover" />

      <div :class="styles.header">
        <div :class="styles.avatarWrap">
          <img
            :class="styles.icon"
            :src="groupIcon || DEFAULT_ICON"
            alt="group avatar"
            @click="groupIcon && openImagePreviewWindow([groupIcon], 0)"
            @error="handleImgError"
          />
        </div>
        <div :class="styles.name">
          {{ groupInfo?.group_name || t('groupInfo.group') }}
        </div>
        <div :class="styles.metaChips">
          <span :class="styles.chip">
            <TeamOutlined />
            {{ groupInfo?.member_count || 0 }}
            {{ t('groupInfo.members') }}
          </span>
        </div>
      </div>

      <div :class="styles.infoSection">
        <div :class="styles.infoItem">
          <span :class="styles.iconChip"><IdcardOutlined /></span>
          <span :class="styles.label">{{ t('groupInfo.groupId') }}</span>
          <span :class="styles.value">{{ groupInfo?.group_uuid || '-' }}</span>
        </div>

        <div :class="styles.infoItem">
          <span :class="styles.iconChip"><CalendarOutlined /></span>
          <span :class="styles.label">{{ t('groupInfo.createdAt') }}</span>
          <span :class="styles.value">
            {{ groupInfo?.created_at ? formatDate(groupInfo.created_at) : '-' }}
          </span>
        </div>

        <a-collapse :class="styles.collapse" ghost expand-icon-position="end">
          <a-collapse-panel
            key="members"
            :header="`${t('groupSettings.groupMembers')} (${members.length})`"
          >
            <a-list :data-source="members">
              <template #renderItem="{ item: member }">
                <a-list-item :class="styles.memberItem">
                  <div :class="styles.memberInfo">
                    <a-avatar
                      :size="32"
                      :src="getMemberInfo(member.user_uuid)?.icon"
                    >
                      <template #icon><UserOutlined /></template>
                    </a-avatar>
                    <div :class="styles.memberDetail">
                      <span :class="styles.memberName">
                        {{ getMemberDisplayName(member) }}
                        <UserTypeTag
                          :type="getMemberInfo(member.user_uuid)?.user_type"
                        />
                      </span>
                      <span :class="styles.memberRole">
                        {{ getRoleName(member.role) }}
                      </span>
                    </div>
                  </div>
                </a-list-item>
              </template>
            </a-list>
          </a-collapse-panel>
        </a-collapse>
      </div>

      <div :class="styles.footer">
        <a-button
          :class="styles.primaryBtn"
          type="primary"
          @click="routeToChat"
        >
          <template #icon><MessageOutlined /></template>
          {{ t('friendInfo.sendMessage') }}
        </a-button>
        <a-button
          v-if="isOwner"
          :class="styles.secondaryBtn"
          @click="router.push(`/home/chats/group-settings?groupId=${groupId}`)"
        >
          {{ t('groupSettings.title') }}
        </a-button>
      </div>
    </div>
  </div>
</template>
