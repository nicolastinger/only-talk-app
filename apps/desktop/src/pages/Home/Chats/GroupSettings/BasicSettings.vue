<script setup lang="ts">
import { reactive, ref } from 'vue';
import { DEFAULT_ICON } from '@/constants';
import {
  CROP_CANCELLED_ERROR,
  useAvatarCropper,
} from '@/hooks/useAvatarCropper';
import {
  convertPathToTauriUrl,
  getApiBase,
  getFiles,
  isBackendSuccess,
  isHttpSuccess,
  openImagePreviewWindow,
  selectFile,
  update_group,
} from '@workspace/services';
import type { GroupVo } from '@workspace/types';
import { CameraOutlined, LoadingOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();

const props = defineProps<{
  groupInfo: GroupVo;
}>();

const emit = defineEmits<{
  (e: 'update'): void;
}>();

const saving = ref(false);
const avatarUploading = ref(false);
const avatarUrl = ref<string | null>(null);
const { startCrop } = useAvatarCropper();

const formState = reactive({
  group_name: props.groupInfo.group_name,
  description: props.groupInfo.description || '',
});

const rules = {
  group_name: [
    { required: true, message: t('contacts.createGroup.nameRequired') },
    { max: 50, message: t('groupSettings.nameMaxLength', { max: 50 }) },
  ],
};

const handleAvatarUpload = async () => {
  if (avatarUploading.value) return;
  try {
    const files = await selectFile(false);
    if (!files || files.length === 0) return;

    const filePath = files[0];

    const croppedPath = await startCrop(filePath);

    avatarUploading.value = true;

    const preview = convertPathToTauriUrl(croppedPath);
    if (preview) {
      avatarUrl.value = preview;
    }

    const uploadResult = await invoke<{ status: number; body: string }>(
      'upload_file_request',
      {
        url: `${getApiBase()}/file_integrated/upload/group_avatar/${props.groupInfo.group_uuid}`,
        filePath: croppedPath,
        fieldName: 'file',
      },
    );

    if (isHttpSuccess(uploadResult.status)) {
      const responseBody = uploadResult.body
        ? JSON.parse(uploadResult.body)
        : null;
      if (
        responseBody &&
        isBackendSuccess(responseBody.code) &&
        responseBody.data
      ) {
        const bizId = responseBody.data;
        const FileVos = await getFiles(bizId);
        const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

        if (tauriFilePath) {
          avatarUrl.value = tauriFilePath;
          feedback.message.success(t('groupSettings.avatar.updateSuccess'));
          emit('update');
        } else {
          feedback.message.error(t('groupSettings.avatar.getFileFailed'));
        }
      } else {
        feedback.message.error(
          responseBody?.msg || t('groupSettings.avatar.uploadFailed'),
        );
      }
    } else {
      feedback.message.error(t('groupSettings.avatar.uploadFailed'));
    }
  } catch (error) {
    if (error instanceof Error && error.message === CROP_CANCELLED_ERROR) {
      return;
    }
    console.error('群头像更新失败:', error);
    feedback.message.error(
      (error instanceof Error ? error.message : String(error)) ||
        t('groupSettings.avatar.updateFailed'),
    );
  } finally {
    avatarUploading.value = false;
  }
};

const handleSave = async (values: {
  group_name: string;
  description: string;
}) => {
  saving.value = true;
  try {
    await update_group({
      group_uuid: props.groupInfo.group_uuid,
      group_name: values.group_name,
      description: values.description,
    });
    feedback.message.success(t('groupSettings.saveSuccess'));
    emit('update');
  } catch (error) {
    feedback.message.error(t('groupSettings.saveFailed'));
  } finally {
    saving.value = false;
  }
};

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};

const handleAvatarClick = () => {
  if (avatarUrl.value) openImagePreviewWindow([avatarUrl.value], 0);
};
</script>

<template>
  <div>
    <div :class="styles.avatarSection">
      <div
        :class="styles.avatarWrapper"
        style="cursor: pointer"
        @click="handleAvatarClick"
      >
        <a-spin :spinning="avatarUploading">
          <template #indicator>
            <LoadingOutlined style="font-size: 24px" spin />
          </template>
          <img
            :class="styles.avatar"
            :src="avatarUrl || groupInfo.avatar || DEFAULT_ICON"
            alt="group avatar"
            @error="handleImgError"
          />
        </a-spin>
        <div
          v-if="!avatarUploading"
          :class="styles.avatarOverlay"
          @click.stop="handleAvatarUpload"
        >
          <CameraOutlined style="font-size: 20px; color: #fff" />
        </div>
      </div>
      <span :class="styles.avatarHint">
        {{ t('groupSettings.changeAvatarHint') }}
      </span>
    </div>

    <a-form
      :model="formState"
      layout="vertical"
      :rules="rules"
      @finish="handleSave"
    >
      <div :class="styles.formSection">
        <label :class="styles.formLabel">{{ t('groupSettings.nameLabel') }}</label>
        <a-form-item name="group_name">
          <a-input
            v-model:value="formState.group_name"
            :placeholder="t('groupSettings.namePlaceholder')"
          />
        </a-form-item>
      </div>

      <div :class="styles.formSection">
        <label :class="styles.formLabel">{{ t('groupSettings.descLabel') }}</label>
        <a-form-item name="description">
          <a-textarea
            v-model:value="formState.description"
            :rows="4"
            :placeholder="t('groupSettings.descPlaceholderOptional')"
            :maxlength="200"
            show-count
          />
        </a-form-item>
      </div>

      <a-form-item>
        <a-button type="primary" html-type="submit" :loading="saving">
          {{ t('groupSettings.saveChanges') }}
        </a-button>
      </a-form-item>
    </a-form>

    <div style="margin-top: 24px; color: var(--color-gray-text); font-size: 12px">
      <div>{{ t('groupSettings.groupId') }}: {{ groupInfo.group_uuid }}</div>
      <div>
        {{ t('groupSettings.createdAt') }}:
        {{
          groupInfo.created_at
            ? new Date(groupInfo.created_at).toLocaleDateString('zh-CN')
            : '-'
        }}
      </div>
    </div>
  </div>
</template>
