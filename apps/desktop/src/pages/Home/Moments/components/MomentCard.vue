<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/stores/app';
import ReportModal from '@/components/ReportModal/index.vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  delete_moment,
  getFiles,
  openImagePreviewWindow,
  switch_moment_like,
  switch_user_follow,
} from '@workspace/services';
import { ReportTargetType, type MomentVo } from '@workspace/types';
import MomentMedia from './MomentMedia.vue';
import styles from './styles/MomentCard.module.less';

const props = defineProps<{
  moment: MomentVo;
  index?: number;
}>();

const emit = defineEmits<{
  (e: 'openComments', moment: MomentVo): void;
  (e: 'openDetail', moment: MomentVo): void;
  (e: 'openUser', moment: MomentVo): void;
  (e: 'mediaLoad'): void;
  (e: 'deleted', moment: MomentVo): void;
}>();

const { t } = useI18n();
const store = useBearStore();
const myUuid = computed(() => store.userInfo.uuid);
const isMine = computed(
  () => !!myUuid.value && myUuid.value === props.moment.author_uuid,
);

const avatar = ref<string | null>(null);
const images = ref<string[]>([]);
const likeCount = ref(props.moment.like_count);
const liked = ref(props.moment.liked_by_me);
const liking = ref(false);
const isFollowing = ref(!!props.moment.followed_by_me);
const following = ref(false);
const reportModalVisible = ref(false);

const cardStyle = computed<CSSProperties>(
  () =>
    ({
      '--seq': (props.index ?? 0) * 40,
    }) as CSSProperties,
);

const load = async () => {
  const moment = props.moment;
  if (moment.icon) {
    const files = await getFiles(moment.icon);
    avatar.value = files?.[0]?.tauri_file_path || null;
  }
  // 仅在明确 0 图时跳过; undefined(旧后端)也尝试拉取, 保证图片展示
  if (
    moment.image_count === null ||
    moment.image_count === undefined ||
    moment.image_count > 0
  ) {
    const imgFiles = await getFiles(moment.uuid);
    images.value = (imgFiles || [])
      .map((f) => f.tauri_file_path || '')
      .filter(Boolean);
  }
};

watch(
  () => [props.moment.icon, props.moment.uuid],
  load,
  { immediate: true },
);

const handleOpenUser = (e: MouseEvent) => {
  e.stopPropagation();
  emit('openUser', props.moment);
};

const handleLike = async (e: MouseEvent) => {
  e.stopPropagation();
  if (liking.value) return;
  liking.value = true;
  try {
    await switch_moment_like({ moment_uuid: props.moment.uuid });
    liked.value = !liked.value;
    likeCount.value = liked.value
      ? likeCount.value + 1
      : Math.max(0, likeCount.value - 1);
  } catch (e) {
    console.error(e);
    feedback.message.error((e as Error).message || '操作失败');
  } finally {
    liking.value = false;
  }
};

const handleFollow = async (e: MouseEvent) => {
  e.stopPropagation();
  if (following.value || isMine.value) return;
  following.value = true;
  const prev = isFollowing.value;
  isFollowing.value = !isFollowing.value;
  try {
    await switch_user_follow({
      target_user_uuid: props.moment.author_uuid,
    });
  } catch (e) {
    console.error(e);
    isFollowing.value = prev;
    feedback.message.error((e as Error).message || '操作失败');
  } finally {
    following.value = false;
  }
};

const handleDelete = async (e: MouseEvent) => {
  e.stopPropagation();
  feedback.modal.confirm({
    title: t('moments.delete'),
    content: t('moments.deleteConfirm'),
    okText: t('moments.delete'),
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await delete_moment({ moment_uuid: props.moment.uuid });
        feedback.message.success(t('moments.deleteSuccess'));
        emit('deleted', props.moment);
      } catch (err) {
        feedback.message.error((err as Error).message || '操作失败');
      }
    },
  });
};

const handleError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};

const previewAvatar = (e: MouseEvent) => {
  e.stopPropagation();
  if (avatar.value) openImagePreviewWindow([avatar.value], 0);
};

const handleOpenComments = (e: MouseEvent) => {
  e.stopPropagation();
  emit('openComments', props.moment);
};
</script>

<template>
  <div
    :class="styles.card"
    :style="cardStyle"
    role="button"
    tabindex="0"
    @click="emit('openDetail', moment)"
  >
    <MomentMedia :images="images" @media-load="emit('mediaLoad')" />

    <div v-if="moment.content" :class="styles.content">
      {{ moment.content }}
    </div>

    <div :class="styles.footer">
      <div :class="styles.userRow">
        <img
          :src="avatar || DEFAULT_ICON"
          :class="styles.avatar"
          alt="avatar"
          @click="previewAvatar"
          @error="handleError"
        />
        <div :class="styles.userMeta">
          <div :class="styles.usernameRow">
            <span :class="styles.username" @click="handleOpenUser">
              {{ moment.username || '用户' }}
              <UserTypeTag :type="moment.user_type" />
            </span>
            <span v-if="isMine" :class="styles.mineBadge">
              {{ t('moments.mine') }}
            </span>
          </div>
          <div :class="styles.time">
            {{ new Date(moment.created_at * 1000).toLocaleString('zh-CN') }}
          </div>
        </div>
      </div>
      <div :class="styles.actions">
        <button
          v-if="!isMine"
          type="button"
          :class="[styles.followBtn, isFollowing ? styles.followed : '']"
          :disabled="following"
          @click="handleFollow"
        >
          {{ isFollowing ? t('moments.following') : t('moments.follow') }}
        </button>
        <button
          v-if="isMine"
          type="button"
          :class="styles.deleteBtn"
          @click="handleDelete"
        >
          {{ t('moments.delete') }}
        </button>
        <button
          type="button"
          :class="[styles.actionBtn, liked ? styles.active : '']"
          @click="handleLike"
        >
          {{ liked ? '♥' : '♡' }} {{ likeCount }}
        </button>
        <button
          type="button"
          :class="styles.actionBtn"
          @click="handleOpenComments"
        >
          💬 {{ moment.comment_count }}
        </button>
        <button
          v-if="!isMine"
          type="button"
          :class="styles.actionBtn"
          @click.stop="reportModalVisible = true"
        >
          {{ t('report.action') }}
        </button>
      </div>
    </div>

    <ReportModal
      :open="reportModalVisible"
      :target-type="ReportTargetType.MOMENT"
      :target-uuid="moment.uuid"
      :target-name="moment.username || ''"
      @close="reportModalVisible = false"
    />
  </div>
</template>
