<script setup lang="ts">
import { ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  convertPathToTauriUrl,
  create_moment,
  getApiBase,
  isBackendSuccess,
  isHttpSuccess,
  selectFile,
} from '@workspace/services';
import styles from './styles/MomentComposer.module.less';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success'): void;
}>();

const { t } = useI18n();

const content = ref('');
const visibility = ref(0);
const images = ref<string[]>([]);
const fileIds = ref<string[]>([]);
const loading = ref(false);
const uploading = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      content.value = '';
      visibility.value = 0;
      images.value = [];
      fileIds.value = [];
    }
  },
  { immediate: true },
);

const handleSelect = async () => {
  const files = await selectFile(true);
  if (!files || files.length === 0) return;
  // selectFile 对多选返回嵌套数组 [[path...]], 扁平化一层
  const picked = files.flat();
  uploading.value = true;
  try {
    for (const fp of picked) {
      const compressed = await invoke<string>(
        'compress_image_to_webp_command',
        {
          inputPath: fp,
        },
      );
      const preview = convertPathToTauriUrl(compressed);
      const res = await invoke<{ status: number; body: string }>(
        'upload_file_request',
        {
          url: `${getApiBase()}/file_integrated/upload/moment`,
          filePath: compressed,
          fieldName: 'file',
        },
      );
      if (isHttpSuccess(res.status)) {
        const json = res.body ? JSON.parse(res.body) : null;
        if (json && isBackendSuccess(json.code) && json.data) {
          if (preview) images.value = [...images.value, preview];
          fileIds.value = [...fileIds.value, json.data];
        } else {
          feedback.message.error(json?.message || '上传失败');
        }
      } else {
        feedback.message.error('上传失败');
      }
    }
  } catch (e) {
    console.error('上传动态图片失败:', e);
    feedback.message.error('上传动态图片失败');
  } finally {
    uploading.value = false;
  }
};

const handlePublish = async () => {
  const trimmed = content.value.trim();
  if (!trimmed) {
    feedback.message.warning(t('moments.composer.contentEmpty'));
    return;
  }
  loading.value = true;
  try {
    const created = await create_moment({
      content: trimmed,
      visibility: visibility.value,
      file_ids: fileIds.value,
    });
    if (created) {
      feedback.message.success(t('moments.composer.publishSuccess'));
      emit('close');
      emit('success');
    }
  } catch (e) {
    console.error('发布动态失败:', e);
    feedback.message.error((e as Error).message || '发布动态失败');
  } finally {
    loading.value = false;
  }
};

const removeImage = (i: number) => {
  images.value = images.value.filter((_, idx) => idx !== i);
  fileIds.value = fileIds.value.filter((_, idx) => idx !== i);
};
</script>

<template>
  <a-modal
    :title="t('moments.composer.title')"
    :open="open"
    :closable="false"
    centered
    @cancel="emit('close')"
  >
    <div :class="styles.composer">
      <a-textarea
        v-model:value="content"
        :rows="4"
        :max-length="2000"
        :placeholder="t('moments.composer.placeholder')"
      />
      <div :class="styles.visibilityRow">
        <span :class="styles.label">
          {{ t('moments.composer.visibility') }}
        </span>
        <a-segmented
          v-model:value="visibility"
          :options="[
            { label: t('moments.composer.public'), value: 0 },
            { label: t('moments.composer.self'), value: 1 },
          ]"
        />
      </div>
      <div :class="styles.imageArea">
        <button
          type="button"
          :class="styles.addBtn"
          :disabled="uploading"
          @click="handleSelect"
        >
          {{
            uploading
              ? t('moments.composer.uploading')
              : t('moments.composer.addImage')
          }}
        </button>
        <div v-if="images.length > 0" :class="styles.previewGrid">
          <div
            v-for="(img, i) in images"
            :key="i"
            :class="styles.previewItem"
          >
            <img :src="img" alt="" :class="styles.previewImg" />
            <button
              type="button"
              :class="styles.removeBtn"
              @click="removeImage(i)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <a-button @click="emit('close')">
        {{ t('moments.composer.cancel') }}
      </a-button>
      <a-button type="primary" :loading="loading" @click="handlePublish">
        {{ t('moments.composer.publish') }}
      </a-button>
    </template>
  </a-modal>
</template>
