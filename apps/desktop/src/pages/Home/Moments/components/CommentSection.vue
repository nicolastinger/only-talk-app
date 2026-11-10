<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/stores/app';
import ReportModal from '@/components/ReportModal/index.vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  get_moment_comments,
  getFiles,
  openImagePreviewWindow,
  post_moment_comment,
} from '@workspace/services';
import { ReportTargetType, type MomentCommentVo } from '@workspace/types';
import SimpleEmptyImg from 'ant-design-vue/es/empty/simple';
import styles from './styles/CommentSection.module.less';

const PAGE_SIZE = 10;

const props = defineProps<{
  momentUuid: string;
}>();

const emit = defineEmits<{
  (e: 'countChange', delta: number): void;
}>();

const { t } = useI18n();
const store = useBearStore();
const myUuid = computed(() => store.userInfo.uuid);

const comments = ref<MomentCommentVo[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const submitting = ref(false);
const text = ref('');
const avatars = ref<Record<string, string>>({});
const reportComment = ref<MomentCommentVo | null>(null);
let loadingLock = false;

const loadComments = async (p: number, reset: boolean) => {
  if (loadingLock) return;
  loadingLock = true;
  if (reset) {
    loading.value = true;
  } else {
    loadingMore.value = true;
  }
  try {
    const res = await get_moment_comments(props.momentUuid, p, PAGE_SIZE);
    total.value = res.total;
    comments.value = reset ? res.list : [...comments.value, ...res.list];
    page.value = p;
    if (reset) {
      const record: Record<string, string> = {};
      for (const c of res.list) {
        if (c.icon && !record[c.icon]) {
          const files = await getFiles(c.icon);
          if (files?.[0]?.tauri_file_path) {
            record[c.icon] = files[0].tauri_file_path;
          }
        }
      }
      avatars.value = record;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loadingLock = false;
    loading.value = false;
    loadingMore.value = false;
  }
};

const loadInitial = () => {
  if (props.momentUuid) {
    text.value = '';
    comments.value = [];
    loadComments(1, true);
  }
};

watch(() => props.momentUuid, loadInitial);
onMounted(loadInitial);

const handleSubmit = async () => {
  const trimmed = text.value.trim();
  if (!trimmed) return;
  submitting.value = true;
  try {
    await post_moment_comment({
      moment_uuid: props.momentUuid,
      content: trimmed,
    });
    text.value = '';
    emit('countChange', 1);
    await loadComments(1, true);
  } catch (e) {
    console.error(e);
    feedback.message.error(
      (e as Error).message || t('moments.detail.commentFailed'),
    );
  } finally {
    submitting.value = false;
  }
};

const hasMore = computed(() => comments.value.length < total.value);

const preview = (icon?: string) => {
  const url = avatars.value[icon || ''];
  if (url) openImagePreviewWindow([url], 0);
};
</script>

<template>
  <div :class="styles.section">
    <div :class="styles.head">{{ t('moments.comments.title') }}</div>
    <div v-if="comments.length === 0 && !loading" :class="styles.empty">
      <a-empty
        :image="SimpleEmptyImg"
        :description="t('moments.comments.empty')"
      />
    </div>
    <div v-else :class="styles.list">
      <div
        v-for="item in comments"
        :key="item.id"
        :class="styles.commentItem"
      >
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
            <button
              v-if="item.author_uuid !== myUuid"
              type="button"
              :class="styles.reportBtn"
              @click="reportComment = item"
            >
              {{ t('report.action') }}
            </button>
          </div>
          <div :class="styles.commentText">{{ item.content }}</div>
        </div>
      </div>
      <div v-if="loading" :class="styles.loading">
        <a-spin size="small" />
      </div>
      <button
        v-else-if="hasMore"
        type="button"
        :class="styles.loadMore"
        @click="loadComments(page + 1, false)"
      >
        {{ t('moments.loadMore') }}
      </button>
    </div>
    <div :class="styles.inputRow">
      <a-input
        v-model:value="text"
        :max-length="1000"
        :placeholder="t('moments.comments.placeholder')"
        @press-enter="handleSubmit"
      />
      <a-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ t('moments.comments.send') }}
      </a-button>
    </div>

    <ReportModal
      :open="!!reportComment"
      :target-type="ReportTargetType.MOMENT_COMMENT"
      :target-uuid="reportComment?.id || ''"
      :target-name="reportComment?.username || ''"
      @close="reportComment = null"
    />
  </div>
</template>
