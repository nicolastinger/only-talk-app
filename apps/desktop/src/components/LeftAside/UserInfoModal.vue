<script setup lang="ts">
import { computed, reactive, ref, watch, type Component } from 'vue';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CameraOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  ManOutlined,
  UserOutlined,
  WomanOutlined,
} from '@ant-design/icons-vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import {
  CROP_CANCELLED_ERROR,
  useAvatarCropper,
} from '@/hooks/useAvatarCropper';
import { useBearStore } from '@/stores/app';
import { calcAgeFromBirthday } from '@/utils/format';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import { invoke } from '@tauri-apps/api/core';
import {
  convertPathToTauriUrl,
  getApiBase,
  getFiles,
  isBackendSuccess,
  isHttpSuccess,
  refresh_user_info,
  selectFile,
  update_user_info,
} from '@workspace/services';
import type { UpdateUserDTO } from '@workspace/types';
import styles from './index.module.less';

const props = defineProps<{
  visible: boolean;
  onClose: () => void;
}>();

const TIMEOUT_MS = 30000;
const { t } = useI18n();
const store = useBearStore();
const { startCrop } = useAvatarCropper();

const loading = ref(false);
const previewUrl = ref<string | null>(null);
const avatarUrl = ref<string | null>(null);
const isEditing = ref(false);
const saving = ref(false);
const formRef = ref();

const formModel = reactive<{
  username?: string;
  info?: string;
  gender?: number;
  birthday?: Dayjs | null;
  phone?: string;
  email?: string;
  address?: string;
}>({});

const genderMap: Record<
  number,
  { label: string; icon: Component; color?: string }
> = {
  0: { label: t('userInfo.genderTypes.unknown'), icon: UserOutlined },
  1: { label: t('userInfo.genderTypes.secret'), icon: UserOutlined },
  2: {
    label: t('userInfo.genderTypes.male'),
    icon: ManOutlined,
    color: '#1890ff',
  },
  3: {
    label: t('userInfo.genderTypes.female'),
    icon: WomanOutlined,
    color: '#eb2f96',
  },
  4: { label: t('userInfo.genderTypes.robot'), icon: UserOutlined },
  5: { label: t('userInfo.genderTypes.other'), icon: UserOutlined },
};

const genderOptions = Object.entries(genderMap).map(([value, item]) => ({
  value: Number(value),
  label: item.label,
}));

const userInfo = computed(() => store.userInfo);

const getUserIcon = async (icon: string) => {
  try {
    const FileVos = await getFiles(icon);
    avatarUrl.value = FileVos?.[0]?.tauri_file_path || null;
  } catch (error) {
    console.error('获取头像失败:', error);
    avatarUrl.value = null;
  }
};

watch(
  () => userInfo.value?.icon,
  (icon) => {
    if (icon) getUserIcon(icon);
  },
  { immediate: true },
);

const handleAvatarClick = async () => {
  if (loading.value) return;
  try {
    const files = await selectFile(false);
    if (!files || files.length === 0) return;
    const filePath = files[0];
    const croppedPath = await startCrop(filePath);

    loading.value = true;
    const preview = convertPathToTauriUrl(croppedPath);
    if (preview) previewUrl.value = preview;

    window.dispatchEvent(new CustomEvent('uploadStart'));

    const uploadResult = await Promise.race([
      invoke<{ status: number; body: string }>('upload_file_request', {
        url: `${getApiBase()}/file_integrated/upload/user_avatar`,
        filePath: croppedPath,
        fieldName: 'file',
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(new Error(t('userInfo.avatar.uploadTimeout'))),
          TIMEOUT_MS,
        );
      }),
    ]);

    window.dispatchEvent(new CustomEvent('uploadEnd'));

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
          store.setUserInfo({ ...store.userInfo, icon: bizId });
          getUserIcon(bizId);
          feedback.message.success(t('userInfo.avatar.updateSuccess'));
        } else {
          feedback.message.error(t('userInfo.avatar.getFileFailed'));
        }
      } else {
        feedback.message.error(
          responseBody?.msg || t('userInfo.avatar.uploadFailed'),
        );
      }
    } else {
      feedback.message.error(t('userInfo.avatar.uploadFailed'));
    }
  } catch (error) {
    if (error instanceof Error && error.message === CROP_CANCELLED_ERROR) {
      return;
    }
    console.error('头像更新失败:', error);
    feedback.message.error(
      (error instanceof Error ? error.message : String(error)) ||
        t('userInfo.avatar.updateFailed'),
    );
    window.dispatchEvent(new CustomEvent('uploadEnd'));
  } finally {
    loading.value = false;
    previewUrl.value = null;
  }
};

const formatBirthday = (timestamp?: number) => {
  if (!timestamp) return t('userInfo.notSet');
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN');
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  feedback.message.success(t('userInfo.copied'));
};

const handleEdit = () => {
  isEditing.value = true;
  formModel.username = store.userInfo?.username;
  formModel.info = store.userInfo?.info;
  formModel.gender = store.userInfo?.gender;
  formModel.birthday = store.userInfo?.birthday
    ? dayjs.unix(store.userInfo.birthday)
    : null;
  formModel.phone = store.userInfo?.phone;
  formModel.email = store.userInfo?.email;
  formModel.address = store.userInfo?.address;
};

const handleCancelEdit = () => {
  isEditing.value = false;
  formRef.value?.resetFields?.();
};

const handleSave = async () => {
  try {
    await formRef.value?.validate?.();
    saving.value = true;

    const values = formModel;
    const current = store.userInfo;
    const updateData: UpdateUserDTO = {};
    if (values.username !== current?.username) {
      updateData.username = values.username;
    }
    if (values.info !== current?.info) {
      updateData.info = values.info;
    }
    if (values.gender !== current?.gender) {
      updateData.gender = Number(values.gender);
    }
    if (values.birthday) {
      const birthdayTimestamp = values.birthday.unix();
      if (birthdayTimestamp !== current?.birthday) {
        updateData.birthday = birthdayTimestamp;
      }
    }
    if (values.phone !== current?.phone) {
      updateData.phone = values.phone;
    }
    if (values.email !== current?.email) {
      updateData.email = values.email;
    }
    if (values.address !== current?.address) {
      updateData.address = values.address;
    }

    if (Object.keys(updateData).length === 0) {
      feedback.message.info(t('userInfo.edit.noChanges'));
      isEditing.value = false;
      return;
    }

    const response = await update_user_info(updateData);

    if (response.netSuccess && isHttpSuccess(response.res.status)) {
      const data = response.res.body ? JSON.parse(response.res.body) : null;
      if (data && isBackendSuccess(data.code)) {
        const updatedUserInfo = await refresh_user_info(store.userInfo.uuid);
        store.setUserInfo(updatedUserInfo);
        feedback.message.success(t('userInfo.edit.updateSuccess'));
        isEditing.value = false;
      }
    } else {
      feedback.message.error(
        response.error || t('userInfo.edit.updateFailed'),
      );
    }
  } catch (error) {
    console.error('更新用户信息失败:', error);
    feedback.message.error(
      (error instanceof Error ? error.message : String(error)) ||
        t('userInfo.edit.updateFailed'),
    );
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <a-modal
    :open="visible"
    :closable="false"
    :footer="null"
    centered
    :width="420"
    :class="styles.userModal"
    @cancel="props.onClose"
  >
    <div :class="styles.modalContent">
      <div :class="styles.avatarSection">
        <div :class="styles.avatarWrapper" @click="handleAvatarClick">
          <a-spin :spinning="loading">
            <a-avatar
              :size="80"
              :src="previewUrl || avatarUrl || DEFAULT_ICON"
              :class="styles.largeAvatar"
            >
              <template #icon><UserOutlined /></template>
            </a-avatar>
          </a-spin>
          <div v-if="!loading" :class="styles.avatarOverlay">
            <CameraOutlined :class="styles.cameraIcon" />
          </div>
        </div>

        <a-form
          v-if="isEditing"
          ref="formRef"
          :model="formModel"
          layout="vertical"
          :class="styles.editForm"
        >
          <a-form-item
            name="username"
            :label="t('userInfo.username')"
            :rules="[
              { max: 50, message: t('userInfo.edit.usernameMaxLength') },
            ]"
          >
            <a-input
              v-model:value="formModel.username"
              :placeholder="t('userInfo.edit.usernamePlaceholder')"
            />
          </a-form-item>

          <a-form-item
            name="info"
            :label="t('userInfo.info')"
            :rules="[{ max: 200, message: t('userInfo.edit.infoMaxLength') }]"
          >
            <a-textarea
              v-model:value="formModel.info"
              :rows="2"
              :placeholder="t('userInfo.edit.infoPlaceholder')"
            />
          </a-form-item>

          <a-form-item name="gender" :label="t('userInfo.gender')">
            <a-select
              v-model:value="formModel.gender"
              :placeholder="t('userInfo.edit.selectGender')"
              :options="genderOptions"
            />
          </a-form-item>

          <a-form-item name="birthday" :label="t('userInfo.birthday')">
            <a-date-picker
              v-model:value="formModel.birthday"
              style="width: 100%"
              :placeholder="t('userInfo.edit.selectBirthday')"
            />
          </a-form-item>

          <a-form-item
            name="phone"
            :label="t('userInfo.phone')"
            :rules="[
              {
                pattern: /^1[3-9]\d{9}$/,
                message: t('userInfo.edit.phoneInvalid'),
              },
            ]"
          >
            <a-input
              v-model:value="formModel.phone"
              :placeholder="t('userInfo.edit.phonePlaceholder')"
            />
          </a-form-item>

          <a-form-item
            name="email"
            :label="t('userInfo.email')"
            :rules="[
              {
                type: 'email',
                message: t('userInfo.edit.emailInvalid'),
              },
            ]"
          >
            <a-input
              v-model:value="formModel.email"
              :placeholder="t('userInfo.edit.emailPlaceholder')"
            />
          </a-form-item>

          <a-form-item
            name="address"
            :label="t('userInfo.address')"
            :rules="[
              { max: 200, message: t('userInfo.edit.addressMaxLength') },
            ]"
          >
            <a-input
              v-model:value="formModel.address"
              :placeholder="t('userInfo.edit.addressPlaceholder')"
            />
          </a-form-item>
        </a-form>

        <template v-else>
          <a-typography-title :level="4" :class="styles.username">
            {{ userInfo?.username || t('userInfo.unknown') }}
            <UserTypeTag :type="userInfo?.user_type" />
          </a-typography-title>
          <a-typography-text
            v-if="userInfo?.info"
            type="secondary"
            :class="styles.bio"
          >
            {{ userInfo.info }}
          </a-typography-text>
        </template>
      </div>

      <div v-if="!isEditing" :class="styles.infoSection">
        <div :class="styles.infoItem">
          <span :class="styles.label">{{ t('userInfo.account') }}</span>
          <span :class="styles.value">{{ userInfo?.account || '-' }}</span>
        </div>

        <div :class="styles.infoItem">
          <span :class="styles.label">UUID</span>
          <span
            :class="[styles.value, styles.uuidValue]"
            :title="t('userInfo.clickToCopy')"
            @click="userInfo?.uuid && copyToClipboard(userInfo.uuid)"
          >
            {{ userInfo?.uuid || '-' }}
          </span>
        </div>

        <div :class="styles.infoItem">
          <span :class="styles.label">{{ t('userInfo.gender') }}</span>
          <span :class="styles.value">
            {{
              userInfo?.gender !== undefined
                ? genderMap[userInfo.gender]?.label
                : '-'
            }}
          </span>
        </div>

        <div :class="styles.infoItem">
          <span :class="styles.label">{{ t('userInfo.age') }}</span>
          <span :class="styles.value">
            {{ calcAgeFromBirthday(userInfo?.birthday) ?? '-' }}
          </span>
        </div>

        <a-collapse :class="styles.collapse" ghost>
          <a-collapse-panel key="1" :header="t('userInfo.moreInfo')">
            <div :class="styles.infoItem">
              <span :class="styles.label">{{ t('userInfo.birthday') }}</span>
              <span :class="styles.value">
                {{ formatBirthday(userInfo?.birthday) }}
              </span>
            </div>
            <div :class="styles.infoItem">
              <span :class="styles.label">{{ t('userInfo.phone') }}</span>
              <span :class="styles.value">{{ userInfo?.phone || '-' }}</span>
            </div>
            <div :class="styles.infoItem">
              <span :class="styles.label">{{ t('userInfo.email') }}</span>
              <span :class="styles.value">{{ userInfo?.email || '-' }}</span>
            </div>
            <div :class="styles.infoItem">
              <span :class="styles.label">{{ t('userInfo.address') }}</span>
              <span :class="styles.value">{{ userInfo?.address || '-' }}</span>
            </div>
          </a-collapse-panel>
        </a-collapse>
      </div>

      <div :class="styles.buttonSection">
        <template v-if="isEditing">
          <a-button
            :class="styles.cancelButton"
            :disabled="saving"
            @click="handleCancelEdit"
          >
            <template #icon><CloseOutlined /></template>
            {{ t('userInfo.edit.cancel') }}
          </a-button>
          <a-button
            type="primary"
            :loading="saving"
            :class="styles.saveButton"
            @click="handleSave"
          >
            <template #icon><CheckOutlined /></template>
            {{ t('userInfo.edit.save') }}
          </a-button>
        </template>
        <a-button
          v-else
          type="primary"
          :class="styles.editButton"
          @click="handleEdit"
        >
          <template #icon><EditOutlined /></template>
          {{ t('userInfo.edit.edit') }}
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
