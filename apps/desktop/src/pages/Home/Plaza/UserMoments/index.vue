<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DEFAULT_ICON } from '@/constants';
import MomentList from '@/pages/Home/Moments/components/MomentList.vue';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import {
  getFiles,
  get_plaza_user,
  openImagePreviewWindow,
} from '@workspace/services';
import type { PlazaUser } from '@workspace/types';
import styles from './index.module.less';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const uuid = computed(
  () => (route.params.uuid as string) || route.path.split('/').pop() || '',
);
const user = ref<PlazaUser | null>(null);
const avatar = ref<string | null>(null);

const load = async (targetUuid: string) => {
  try {
    const u = await get_plaza_user(targetUuid);
    user.value = u;
    if (u.icon) {
      const files = await getFiles(u.icon);
      avatar.value = files?.[0]?.tauri_file_path || null;
    }
  } catch (error) {
    console.error(error);
  }
};

watch(
  () => route.params.uuid,
  () => {
    const target = (route.params.uuid as string) || route.path.split('/').pop() || '';
    if (target) load(target);
  },
  { immediate: true },
);

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
      <img
        :class="styles.avatar"
        :src="avatar || DEFAULT_ICON"
        alt="avatar"
        @click="previewAvatar"
        @error="handleError"
      />
      <div :class="styles.headerInfo">
        <div :class="styles.name">
          {{ user?.username || t('plaza.userMomentsTitle') }}
        </div>
        <div :class="styles.subtitle">
          {{ t('plaza.userMomentsSubtitle') }}
        </div>
      </div>
    </div>
    <div :class="styles.body">
      <MomentList
        :refresh-key="0"
        :author-uuid="uuid"
        :empty-text="t('plaza.momentsEmpty')"
      />
    </div>
  </div>
</template>
