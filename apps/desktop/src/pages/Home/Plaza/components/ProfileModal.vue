<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ReportModal from '@/components/ReportModal/index.vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { add_friend, getFiles, isHttpSuccess } from '@workspace/services';
import {
  ReportTargetType,
  type FriendRequestInfoDTO,
  type PlazaUser,
  type RustResponse,
} from '@workspace/types';
import { getGenderLabel } from './genderHelper';
import styles from './styles/ProfileModal.module.less';

const props = defineProps<{
  user: PlazaUser | null;
  addType?: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();
const router = useRouter();
const genderIntl = {
  formatMessage: (d: { id: string }) => t(d.id),
};

const userIcon = ref<string | null>(null);
const sending = ref(false);
const requested = ref(false);
const reportModalVisible = ref(false);

const mapAddFriendError = (result: RustResponse): string => {
  let msg = '';
  try {
    const body = JSON.parse(result.res.body);
    if (typeof body.message === 'string') {
      msg = body.message;
    }
  } catch {
    // ignore parse error
  }
  if (msg.includes('Already added as friend')) {
    return 'friendRequest.alreadyFriend';
  }
  if (msg.includes('Please do not add repeatedly')) {
    return 'friendRequest.duplicateRequest';
  }
  return 'friendRequest.sendFailed';
};

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
      add_type: props.addType || 'plaza',
      version: 0,
      accept_status: 0,
    };
    const result = await add_friend(dto, { autoShowError: false });
    if (result.netSuccess && isHttpSuccess(result.res.status)) {
      requested.value = true;
      feedback.message.success(
        t('friendRequest.requestSent', { username: user.username }),
      );
    } else {
      // 关闭中间层自动展示, 保留本地 i18n 错误文案映射
      feedback.message.error(t(mapAddFriendError(result)));
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
    :width="420"
    :class="styles.modal"
    @cancel="emit('close')"
  >
    <div v-if="user" :class="styles.content">
      <div :class="styles.hero">
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
      </div>

      <div v-if="user.motto" :class="styles.motto">{{ user.motto }}</div>

      <div v-if="user.info" :class="styles.bio">{{ user.info }}</div>

      <div :class="styles.infoSection">
        <div :class="styles.infoItem">
          <span :class="styles.label">{{ t('plaza.gender') }}</span>
          <span :class="styles.value">
            {{
              user.gender !== undefined && user.gender !== null
                ? getGenderLabel(genderIntl, user.gender)
                : '-'
            }}
          </span>
        </div>

        <div :class="styles.infoItem">
          <span :class="styles.label">{{ t('plaza.age') }}</span>
          <span :class="styles.value">{{ user.age ?? '-' }}</span>
        </div>

        <div :class="styles.infoItem">
          <span :class="styles.label">{{ t('plaza.address') }}</span>
          <span :class="styles.value">{{ user.address || '-' }}</span>
        </div>
      </div>

      <div v-if="(user.tags || []).length > 0" :class="styles.tagsSection">
        <span :class="styles.tagsTitle">{{ t('plaza.tagsTitle') }}</span>
        <div :class="styles.tagList">
          <span v-for="tag in user.tags" :key="tag" :class="styles.tagChip">
            {{ tag }}
          </span>
        </div>
      </div>

      <div :class="styles.actions">
        <a-button
          block
          size="large"
          :class="styles.viewBtn"
          @click="viewMoments"
        >
          {{ t('plaza.viewMoments') }}
        </a-button>
        <a-button
          type="primary"
          block
          size="large"
          :loading="sending"
          :disabled="requested"
          :class="styles.friendBtn"
          @click="addFriend"
        >
          {{ requested ? t('plaza.requested') : t('plaza.addFriend') }}
        </a-button>
        <a-button block size="large" danger @click="reportModalVisible = true">
          {{ t('report.action') }}
        </a-button>
      </div>
    </div>
    <ReportModal
      v-if="user"
      :open="reportModalVisible"
      :target-type="ReportTargetType.PLAZA_USER"
      :target-uuid="user.uuid"
      :target-name="user.username || ''"
      @close="reportModalVisible = false"
    />
  </a-modal>
</template>
