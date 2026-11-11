<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useI18n } from '@/i18n';
import {
  get_moment_likers,
  getFiles,
  openImagePreviewWindow,
} from '@workspace/services';
import type { MomentLikerVo } from '@workspace/types';
import SimpleEmptyImg from 'ant-design-vue/es/empty/simple';
import styles from './styles/LikersModal.module.less';

const PAGE_SIZE = 20;

const props = defineProps<{
  momentUuid: string;
  open: boolean;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();

const likers = ref<MomentLikerVo[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const avatars = ref<Record<string, string>>({});

const load = async (p: number, reset: boolean) => {
  loading.value = true;
  try {
    const res = await get_moment_likers(props.momentUuid, p, PAGE_SIZE);
    total.value = res.total;
    likers.value = reset ? res.list : [...likers.value, ...res.list];
    page.value = p;
    if (reset) {
      const record: Record<string, string> = {};
      for (const l of res.list) {
        if (l.icon && !record[l.icon]) {
          const files = await getFiles(l.icon);
          if (files?.[0]?.tauri_file_path) {
            record[l.icon] = files[0].tauri_file_path;
          }
        }
      }
      avatars.value = record;
    }
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
      likers.value = [];
      load(1, true);
    }
  },
  { immediate: true },
);

const hasMore = computed(() => likers.value.length < total.value);

const preview = (icon?: string) => {
  const url = avatars.value[icon || ''];
  if (url) openImagePreviewWindow([url], 0);
};
</script>

<template>
  <a-modal
    :title="t('moments.likers.title')"
    :open="open"
    :closable="false"
    :footer="null"
    centered
    :class="styles.modal"
    @cancel="emit('close')"
  >
    <div v-if="loading && likers.length === 0" :class="styles.loading">
      <a-spin />
    </div>
    <a-empty
      v-else-if="likers.length === 0"
      :image="SimpleEmptyImg"
      :description="t('moments.likers.empty')"
    />
    <div v-else :class="styles.list">
      <div v-for="l in likers" :key="l.uuid" :class="styles.item">
        <a-avatar
          :size="36"
          :src="avatars[l.icon || ''] || DEFAULT_ICON"
          :style="{ cursor: 'pointer' }"
          @click="preview(l.icon)"
        />
        <div :class="styles.meta">
          <span :class="styles.name">
            {{ l.username || l.uuid }}
            <UserTypeTag :type="l.user_type" />
          </span>
          <span :class="styles.time">
            {{ new Date(l.created_at * 1000).toLocaleString('zh-CN') }}
          </span>
        </div>
      </div>
      <button
        v-if="hasMore"
        type="button"
        :class="styles.loadMore"
        @click="load(page + 1, false)"
      >
        {{ t('moments.loadMore') }}
      </button>
    </div>
  </a-modal>
</template>
