<script setup lang="ts">
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useRouter } from 'vue-router';
import { HeartFilled } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { add_friend, getFiles, isHttpSuccess } from '@workspace/services';
import type { FriendRequestInfoDTO, PlazaUser } from '@workspace/types';
import { ref, watch } from 'vue';
import styles from './styles/MatchModal.module.less';

const props = defineProps<{
  user: PlazaUser | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();
const router = useRouter();

const userIcon = ref<string | null>(null);
const sending = ref(false);
const requested = ref(false);

const getUserIcon = async (icon: string) => {
  try {
    if (!icon) {
      userIcon.value = null;
      return;
    }
    const FileVos = await getFiles(icon);
    userIcon.value = FileVos?.[0]?.tauri_file_path || null;
  } catch (error) {
    console.log(error);
  }
};

watch(
  () => props.user,
  (user) => {
    if (user) {
      getUserIcon(user.icon || '');
      requested.value = false;
      sending.value = false;
    } else {
      userIcon.value = null;
    }
  },
  { immediate: true },
);

const viewMoments = () => {
  if (!props.user) return;
  router.push(`/home/plaza/user/${props.user.uuid}`);
};

const addFriend = async () => {
  const user = props.user;
  if (!user) return;
  sending.value = true;
  try {
    const me = (await invoke('get_user_map', { key: 'uuid' })) as string;
    const dto: FriendRequestInfoDTO = {
      request_message: t('friendRequest.defaultRequestMessage'),
      accept_message: '',
      request_user: me,
      accept_user: user.uuid,
      add_type: 'plaza_match',
      version: 0,
      accept_status: 0,
    };
    const result = await add_friend(dto);
    if (result.netSuccess && isHttpSuccess(result.res.status)) {
      requested.value = true;
      feedback.message.success(t('friendRequest.requestSent'));
    } else {
      feedback.message.error(t('friendRequest.sendError'));
    }
  } catch (error) {
    console.error('添加好友失败', error);
    feedback.message.error(t('friendRequest.sendError'));
  } finally {
    sending.value = false;
  }
};

const handleError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <a-modal
    :open="!!user"
    :closable="false"
    :footer="null"
    centered
    :width="380"
    :class="styles.modal"
    @cancel="emit('close')"
  >
    <div v-if="user" :class="styles.content">
      <div :class="styles.badge">
        <HeartFilled />
      </div>
      <div :class="styles.subtitle">{{ t('plaza.matchTitle') }}</div>
      <img
        :class="styles.avatar"
        :src="userIcon || DEFAULT_ICON"
        alt="avatar"
        @error="handleError"
      />
      <div :class="styles.name">
        {{ user.username || '-' }}
        <UserTypeTag :type="user.user_type" />
      </div>
      <div :class="styles.actions">
        <a-button block size="large" :class="styles.viewBtn" @click="viewMoments">
          {{ t('plaza.viewMoments') }}
        </a-button>
        <a-button
          block
          type="primary"
          size="large"
          :loading="sending"
          :disabled="requested"
          :class="styles.friendBtn"
          @click="addFriend"
        >
          {{ requested ? t('plaza.requested') : t('plaza.addFriend') }}
        </a-button>
      </div>
      <button type="button" :class="styles.closeBtn" @click="emit('close')">
        {{ t('plaza.continue') }}
      </button>
    </div>
  </a-modal>
</template>
