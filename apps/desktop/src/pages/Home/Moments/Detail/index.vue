<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/stores/app';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  delete_moment,
  getFiles,
  get_moment_detail,
  openImagePreviewWindow,
  switch_moment_like,
  switch_user_follow,
} from '@workspace/services';
import type { MomentVo } from '@workspace/types';
import CommentSection from '../components/CommentSection.vue';
import LikersModal from '../components/LikersModal.vue';
import MomentMedia from '../components/MomentMedia.vue';
import styles from './index.module.less';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBearStore();

const momentUuid = computed(
  () => (route.params.id as string) || route.path.split('/').pop() || '',
);
const myUuid = computed(() => store.userInfo.uuid);
const isMine = computed(
  () => !!myUuid.value && moment.value?.author_uuid === myUuid.value,
);

const moment = ref<MomentVo | null>(null);
const error = ref<string | null>(null);
const avatar = ref<string | null>(null);
const images = ref<string[]>([]);
const likeCount = ref(0);
const liked = ref(false);
const liking = ref(false);
const commentCount = ref(0);
const isFollowing = ref(false);
const following = ref(false);
const likersOpen = ref(false);
let loadToken = 0;

const load = async (targetUuid: string) => {
  const token = ++loadToken;
  error.value = null;
  moment.value = null;
  try {
    const m = await get_moment_detail(targetUuid);
    if (token !== loadToken) return;
    moment.value = m;
    likeCount.value = m.like_count;
    liked.value = m.liked_by_me;
    commentCount.value = m.comment_count;
    isFollowing.value = !!m.followed_by_me;
    if (m.icon) {
      const files = await getFiles(m.icon);
      if (token === loadToken)
        avatar.value = files?.[0]?.tauri_file_path || null;
    }
    if (
      m.image_count === null ||
      m.image_count === undefined ||
      m.image_count > 0
    ) {
      const imgFiles = await getFiles(targetUuid);
      if (token === loadToken) {
        images.value = (imgFiles || [])
          .map((f) => f.tauri_file_path || '')
          .filter(Boolean);
      }
    }
  } catch (e) {
    console.error(e);
    if (token === loadToken) error.value = (e as Error).message || '加载失败';
  }
};

watch(
  () => route.params.id,
  () => {
    const target =
      (route.params.id as string) || route.path.split('/').pop() || '';
    if (target) load(target);
  },
  { immediate: true },
);

const handleLike = async (e: MouseEvent) => {
  e.stopPropagation();
  if (liking.value) return;
  liking.value = true;
  try {
    await switch_moment_like({ moment_uuid: momentUuid.value });
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

const handleFollow = async () => {
  if (following.value || isMine.value || !moment.value) return;
  following.value = true;
  const prev = isFollowing.value;
  isFollowing.value = !isFollowing.value;
  try {
    await switch_user_follow({
      target_user_uuid: moment.value.author_uuid,
    });
  } catch (e) {
    console.error(e);
    isFollowing.value = prev;
    feedback.message.error((e as Error).message || '操作失败');
  } finally {
    following.value = false;
  }
};

const handleCommentJump = () => {
  const el = document.getElementById('moment-comments');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const handleDelete = () => {
  if (!moment.value) return;
  feedback.modal.confirm({
    title: t('moments.delete'),
    content: t('moments.deleteConfirm'),
    okText: t('moments.delete'),
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await delete_moment({ moment_uuid: moment.value!.uuid });
        feedback.message.success(t('moments.deleteSuccess'));
        router.back();
      } catch (err) {
        feedback.message.error((err as Error).message || '操作失败');
      }
    },
  });
};

const handleCountChange = (delta: number) => {
  commentCount.value = Math.max(0, commentCount.value + delta);
};

const handleError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};

const previewAvatar = () => {
  if (avatar.value) openImagePreviewWindow([avatar.value], 0);
};
</script>

<template>
  <div :class="styles.page">
    <div :class="styles.header">
      <button type="button" :class="styles.backBtn" @click="router.back()">
        <ArrowLeftOutlined />
      </button>
      <span :class="styles.headerTitle">{{ t('moments.detail.title') }}</span>
    </div>

    <div v-if="error" :class="styles.state">
      <a-empty :description="error" />
    </div>
    <div v-else-if="!moment" :class="styles.state">
      <a-spin />
    </div>
    <div v-else :class="styles.body">
      <div :class="styles.authorRow">
        <img
          :src="avatar || DEFAULT_ICON"
          :class="styles.avatar"
          alt="avatar"
          @click="previewAvatar"
          @error="handleError"
        />
        <div :class="styles.authorMeta">
          <div :class="styles.usernameRow">
            <span :class="styles.username">
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
      </div>

      <MomentMedia v-if="images.length > 0" :images="images" />

      <div v-if="moment.content" :class="styles.content">
        {{ moment.content }}
      </div>

      <div :class="styles.actions">
        <button
          type="button"
          :class="[styles.actionBtn, liked ? styles.active : '']"
          @click="handleLike"
        >
          {{ liked ? '♥' : '♡' }}
          <span :class="styles.likeCount" @click.stop="likersOpen = true">
            {{ likeCount }}
          </span>
        </button>
        <button type="button" :class="styles.actionBtn" @click="handleCommentJump">
          💬 {{ commentCount }}
        </button>
      </div>

      <div id="moment-comments">
        <CommentSection
          :moment-uuid="moment.uuid"
          @count-change="handleCountChange"
        />
      </div>
    </div>

    <LikersModal
      :moment-uuid="momentUuid"
      :open="likersOpen"
      @close="likersOpen = false"
    />
  </div>
</template>
