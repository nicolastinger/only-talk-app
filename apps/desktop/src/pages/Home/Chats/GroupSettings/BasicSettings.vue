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
import styles from './index.module.less';

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
    { required: true, message: '请输入群名称' },
    { max: 50, message: '群名称不能超过50个字符' },
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
          feedback.message.success('群头像更新成功');
          emit('update');
        } else {
          feedback.message.error('获取群头像文件失败');
        }
      } else {
        feedback.message.error(responseBody?.msg || '群头像上传失败');
      }
    } else {
      feedback.message.error('群头像上传失败');
    }
  } catch (error) {
    if (error instanceof Error && error.message === CROP_CANCELLED_ERROR) {
      return;
    }
    console.error('群头像更新失败:', error);
    feedback.message.error(
      (error instanceof Error ? error.message : String(error)) || '群头像更新失败',
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
    feedback.message.success('保存成功');
    emit('update');
  } catch (error) {
    feedback.message.error('保存失败');
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
      <span :class="styles.avatarHint">点击更换头像</span>
    </div>

    <a-form
      :model="formState"
      layout="vertical"
      :rules="rules"
      @finish="handleSave"
    >
      <div :class="styles.formSection">
        <label :class="styles.formLabel">群名称</label>
        <a-form-item name="group_name">
          <a-input v-model:value="formState.group_name" placeholder="请输入群名称" />
        </a-form-item>
      </div>

      <div :class="styles.formSection">
        <label :class="styles.formLabel">群简介</label>
        <a-form-item name="description">
          <a-textarea
            v-model:value="formState.description"
            :rows="4"
            placeholder="请输入群简介（选填）"
            :maxlength="200"
            show-count
          />
        </a-form-item>
      </div>

      <a-form-item>
        <a-button type="primary" html-type="submit" :loading="saving">
          保存修改
        </a-button>
      </a-form-item>
    </a-form>

    <div style="margin-top: 24px; color: var(--color-gray-text); font-size: 12px">
      <div>群ID: {{ groupInfo.group_uuid }}</div>
      <div>
        创建时间:
        {{
          groupInfo.created_at
            ? new Date(groupInfo.created_at).toLocaleDateString('zh-CN')
            : '-'
        }}
      </div>
    </div>
  </div>
</template>
