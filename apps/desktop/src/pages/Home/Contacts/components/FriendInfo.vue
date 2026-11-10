<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  IdcardOutlined,
  MailOutlined,
  ManOutlined,
  PhoneOutlined,
  UserOutlined,
  WomanOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import PresenceTag from '@/components/PresenceTag/index.vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { usePresenceStore } from '@/stores/presence';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { calcAgeFromBirthday } from '@/utils/format';
import {
  block_friend,
  get_friend_info,
  get_user_info_with_cache,
  getFiles,
  openImagePreviewWindow,
  refresh_user_info,
  unblock_friend,
} from '@workspace/services';
import type { FriendVo, UserInfo } from '@workspace/types';
import styles from './styles/FriendInfo.module.less';

const props = defineProps<{ uuid: string }>();

const { t } = useI18n();
const router = useRouter();
const presenceStore = usePresenceStore();

const currentFriend = ref<FriendVo>();
const userInfo = ref<UserInfo | null>(null);
const friendIcon = ref<string>('');
const loading = ref(false);
const isBlocked = ref(false);
/** 是否为自己的好友（非好友时只展示资料卡，不显示拉黑） */
const isFriend = ref(false);

// 好友手动状态(仅好友且有状态时展示)
const presence = computed(
  () => presenceStore.friendPresence[props.uuid?.toLowerCase() ?? ''],
);

const genderMap = computed<Record<number, string>>(() => ({
  0: t('userInfo.genderTypes.unknown'),
  1: t('userInfo.genderTypes.secret'),
  2: t('userInfo.genderTypes.male'),
  3: t('userInfo.genderTypes.female'),
  4: t('userInfo.genderTypes.robot'),
  5: t('userInfo.genderTypes.other'),
}));

const getUserIcon = async (icon: string): Promise<string> => {
  try {
    const FileVos = await getFiles(icon);
    return FileVos?.[0]?.tauri_file_path || '';
  } catch (error) {
    feedback.message.error(t('friendInfo.avatarError'));
    console.log(error);
    return '';
  }
};

// HTTP 新资料到手后, 定向回写本地好友表(sqlite 单条), 失败静默
const writebackFriendProfile = async (friendUuid: string, u: UserInfo) => {
  try {
    await invoke('update_friend_profile_command', {
      friendUuid,
      account: u.account || '',
      name: u.username || '',
      icon: u.icon || '',
      info: u.info || '',
    });
  } catch (e) {
    console.log('回写好友资料到本地失败', e);
  }
};

const refreshUserInfo = async (uuid: string) => {
  try {
    const freshUser = await refresh_user_info(uuid);
    console.log('用户信息已刷新:', freshUser);
    userInfo.value = freshUser;

    const friendVo: FriendVo = {
      timestamp: 0,
      friend_id: freshUser.uuid,
      friend_account: freshUser.account || '',
      friend_name: freshUser.username || '',
      friend_icon: freshUser.icon || '',
      friend_status: 0,
      is_del: false,
      is_block: 0,
      is_mute: 0,
      is_top: 0,
      is_show: 1,
    };
    currentFriend.value = friendVo;

    const icon = await getUserIcon(freshUser.icon || '');
    friendIcon.value = icon;

    writebackFriendProfile(uuid, freshUser);
  } catch (err) {
    console.log('后台刷新用户信息失败', err);
  }
};

const initUserData = async (uuid: string) => {
  loading.value = true;
  try {
    // 判断是否为自己的好友：非好友（如群成员）只展示资料卡
    try {
      const friend = await get_friend_info(uuid);
      isFriend.value = !!friend;
    } catch {
      isFriend.value = false;
    }

    const result = await get_user_info_with_cache(uuid);
    console.log('get_user_info_with_cache result:', result);

    const user = result.user_info;
    userInfo.value = user;

    const friendVo: FriendVo = {
      timestamp: 0,
      friend_id: user.uuid,
      friend_account: user.account || '',
      friend_name: user.username || '',
      friend_icon: user.icon || '',
      friend_status: 0,
      is_del: false,
      is_block: 0,
      is_mute: 0,
      is_top: 0,
      is_show: 1,
    };
    currentFriend.value = friendVo;

    const icon = await getUserIcon(user.icon || '');
    friendIcon.value = icon;

    if (result.from_cache) {
      console.log('用户信息来自缓存，后台刷新中...');
      refreshUserInfo(uuid);
    } else {
      // HTTP 拿到的是最新资料, 顺手按 uuid 定向回写本地好友表, 防列表/会话显示旧信息
      writebackFriendProfile(uuid, user);
    }
  } catch (err) {
    console.error('获取用户信息失败', err);
    feedback.message.error(t('friendInfo.loadError') || '获取用户信息失败');
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.uuid,
  (uuid) => {
    console.log('uuid', uuid);
    initUserData(uuid);
    // 资料卡单独补充该用户的状态(merge, 不影响列表已有的其它好友状态)
    presenceStore.loadFriendPresence([uuid], 'merge');
  },
  { immediate: true },
);


const routeToChat = async () => {
  try {
    const res = await invoke('create_chat_session', {
      friendUuid: props.uuid,
    });
    console.log('res', res);
    router.push('/home/chats/chat?currentFriend=' + props.uuid);
  } catch (err) {
    console.log(err);
  }
};

const formatBirthday = (timestamp?: number) => {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('zh-CN');
};

const handleToggleBlock = async () => {
  try {
    if (isBlocked.value) {
      await unblock_friend(props.uuid);
      feedback.message.success(t('friendInfo.unblockedSuccess'));
      isBlocked.value = false;
    } else {
      await block_friend(props.uuid);
      feedback.message.success(t('friendInfo.blockedSuccess'));
      isBlocked.value = true;
    }
  } catch (error) {
    feedback.message.error(
      t(
        isBlocked.value
          ? 'friendInfo.unblockedFailed'
          : 'friendInfo.blockedFailed',
      ),
    );
    console.error('拉黑操作失败:', error);
  }
};

const displayName = computed(
  () => userInfo.value?.username || currentFriend.value?.friend_name || '-',
);
const displayAccount = computed(
  () => userInfo.value?.account || currentFriend.value?.friend_account || '-',
);
const friendAge = computed(() => calcAgeFromBirthday(userInfo.value?.birthday));

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div v-if="loading && !userInfo" :class="styles.container">
    <div :class="styles.content">
      <div :class="styles.loadingState">
        <a-spin size="large" />
      </div>
    </div>
  </div>

  <div v-else :class="styles.container">
    <div :class="styles.content">
      <div :class="styles.cover" />

      <div :class="styles.header">
        <div :class="styles.avatarWrap">
          <img
            :class="styles.icon"
            :src="friendIcon || DEFAULT_ICON"
            alt="avatar"
            @click="friendIcon && openImagePreviewWindow([friendIcon], 0)"
            @error="handleImgError"
          />
        </div>
        <div :class="styles.name">
          {{ displayName }}
          <UserTypeTag :type="userInfo?.user_type" />
        </div>
        <div v-if="presence" :class="styles.presenceRow">
          <PresenceTag :presence="presence" size="default" />
        </div>
        <div v-if="userInfo?.info" :class="styles.bio">
          {{ userInfo.info }}
        </div>
        <div :class="styles.metaChips">
          <span :class="styles.chip">
            <ManOutlined v-if="userInfo?.gender === 2" />
            <WomanOutlined v-else-if="userInfo?.gender === 3" />
            <UserOutlined v-else />
            {{
              userInfo?.gender !== undefined ? genderMap[userInfo.gender] : '-'
            }}
          </span>
          <span v-if="friendAge" :class="styles.chip">
            <CalendarOutlined />
            {{ friendAge }}
          </span>
        </div>
      </div>

      <div :class="styles.infoSection">
        <div :class="styles.infoItem">
          <span :class="styles.iconChip"><IdcardOutlined /></span>
          <span :class="styles.label">{{ t('friendInfo.account') }}</span>
          <span :class="styles.value">{{ displayAccount }}</span>
        </div>

        <a-collapse :class="styles.collapse" ghost expand-icon-position="end">
          <a-collapse-panel key="1" :header="t('friendInfo.moreInfo')">
            <div :class="styles.infoItem">
              <span :class="styles.iconChip"><GiftOutlined /></span>
              <span :class="styles.label">{{ t('friendInfo.birthday') }}</span>
              <span :class="styles.value">
                {{ formatBirthday(userInfo?.birthday) }}
              </span>
            </div>

            <div :class="styles.infoItem">
              <span :class="styles.iconChip"><PhoneOutlined /></span>
              <span :class="styles.label">{{ t('friendInfo.phone') }}</span>
              <span :class="styles.value">{{ userInfo?.phone || '-' }}</span>
            </div>

            <div :class="styles.infoItem">
              <span :class="styles.iconChip"><MailOutlined /></span>
              <span :class="styles.label">{{ t('friendInfo.email') }}</span>
              <span :class="styles.value">{{ userInfo?.email || '-' }}</span>
            </div>

            <div :class="styles.infoItem">
              <span :class="styles.iconChip"><EnvironmentOutlined /></span>
              <span :class="styles.label">{{ t('friendInfo.address') }}</span>
              <span :class="styles.value">{{ userInfo?.address || '-' }}</span>
            </div>
          </a-collapse-panel>
        </a-collapse>
      </div>

      <div :class="styles.footer">
        <a-button
          :class="styles.primaryBtn"
          type="primary"
          @click="routeToChat"
        >
          {{ t('friendInfo.sendMessage') }}
        </a-button>
        <a-button
          v-if="isFriend"
          :class="styles.blockBtn"
          :danger="!isBlocked"
          :type="isBlocked ? 'default' : 'primary'"
          @click="handleToggleBlock"
        >
          {{ t(isBlocked ? 'friendInfo.unblock' : 'friendInfo.block') }}
        </a-button>
      </div>
    </div>
  </div>
</template>
