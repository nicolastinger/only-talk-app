<script setup lang="ts">
import { ref, watch } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  get_moment_comments,
  getFiles,
  openImagePreviewWindow,
  post_moment_comment,
} from '@workspace/services';
import type { MomentCommentVo } from '@workspace/types';
import styles from './styles/CommentModal.module.less';

const props = defineProps<{
  momentUuid: string;
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'commentCountChange', delta: number): void;
}>();

const { t } = useI18n();

const comments = ref<MomentCommentVo[]>([]);
const commentText = ref('');
const loading = ref(false);
const submitting = ref(false);
const avatars = ref<Record<string, string>>({});

const loadComments = async () => {
  loading.value = true;
  try {
    const res = await get_moment_comments(props.momentUuid);
    const list = res.list || [];
    comments.value = list;
    // 预加载评论者头像
    const record: Record<string, string> = {};
    for (const c of list) {
      if (c.icon && !record[c.icon]) {
        const files = await getFiles(c.icon);
        if (files?.[0]?.tauri_file_path) {
          record[c.icon] = files[0].tauri_file_path;
        }
      }
    }
    avatars.value = record;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.open, props.momentUuid],
  () => {
    if (props.open && props.momentUuid) {
      commentText.value = '';
      comments.value = [];
      loadComments();
    }
  },
  { immediate: true },
);

const handleSubmit = async () => {
  const trimmed = commentText.value.trim();
  if (!trimmed) return;
  submitting.value = true;
  try {
    await post_moment_comment({
      moment_uuid: props.momentUuid,
      content: trimmed,
    });
    commentText.value = '';
    emit('commentCountChange', 1);
    await loadComments();
  } catch (e) {
    console.error(e);
    feedback.message.error((e as Error).message || '评论失败');
  } finally {
    submitting.value = false;
  }
};

const preview = (icon?: string) => {
  const url = avatars.value[icon || ''];
  if (url) openImagePreviewWindow([url], 0);
};
</script>

<template>
  <a-modal
    :title="t('moments.comments.title')"
    :open="open"
    :closable="false"
    :footer="null"
    centered
    :class="styles.modal"
    @cancel="emit('close')"
  >
    <a-list
      :loading="loading"
      :data-source="comments"
      :locale="{ emptyText: t('moments.comments.empty') }"
    >
      <template #renderItem="{ item }">
        <a-list-item :key="item.id" :class="styles.commentItem">
          <a-avatar
            :size="32"
            :src="avatars[item.icon || ''] || DEFAULT_ICON"
            :style="{ cursor: 'pointer' }"
            @click="preview(item.icon)"
          />
          <div :class="styles.commentBody">
            <div :class="styles.commentMeta">
              <span :class="styles.name">
                {{ item.username || item.author_uuid }}
                <UserTypeTag :type="item.user_type" />
              </span>
              <span :class="styles.time">
                {{ new Date(item.created_at * 1000).toLocaleString('zh-CN') }}
              </span>
            </div>
            <div :class="styles.commentText">{{ item.content }}</div>
          </div>
        </a-list-item>
      </template>
    </a-list>
    <div :class="styles.inputRow">
      <a-input
        v-model:value="commentText"
        :max-length="1000"
        :placeholder="t('moments.comments.placeholder')"
        @press-enter="handleSubmit"
      />
      <a-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ t('moments.comments.send') }}
      </a-button>
    </div>
  </a-modal>
</template>
