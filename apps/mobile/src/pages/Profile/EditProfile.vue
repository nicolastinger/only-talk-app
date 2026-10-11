<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast, showLoadingToast, closeToast } from "vant";
import { invoke } from "@tauri-apps/api/core";
import {
  selectFile,
  convertPathToTauriUrl,
  cache_user_info,
  isBackendSuccess,
  isHttpSuccess,
} from "@workspace/services";
import { getApiBase } from "@workspace/services";
import type { UserInfo } from "@workspace/types";
import { resolveContentToTempFile } from "@/utils/tempImage";
import AvatarCropPopup, { CropRect } from "@/components/AvatarCropPopup.vue";
import { useUserStore, DEFAULT_AVATAR } from "@/stores/user";
import { useAvatar } from "@/hooks/useAvatar";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();
const { userInfo, loadUserInfo, setUserInfo } = useUserStore();
const { getAvatarUrl } = useAvatar();

const saving = ref(false);
const uploading = ref(false);
const previewUrl = ref<string | null>(null);
const avatarUrl = ref<string | null>(null);
let uploadCancelled = false;
const cropShow = ref(false);
const cropSrc = ref("");
let cropResolver: ((rect: CropRect | null) => void) | null = null;

const startCrop = (filePath: string): Promise<CropRect | null> => {
  cropSrc.value = convertPathToTauriUrl(filePath) || "";
  cropShow.value = true;
  return new Promise<CropRect | null>((resolve) => {
    cropResolver = resolve;
  });
};

const onCropConfirm = (rect: CropRect) => {
  cropResolver?.(rect);
  cropResolver = null;
  cropShow.value = false;
};

const onCropCancel = () => {
  cropResolver?.(null);
  cropResolver = null;
  cropShow.value = false;
};

const genderOptions = computed(() => [
  { name: t("userInfo.genderTypes.unknown"), value: 0 },
  { name: t("userInfo.genderTypes.secret"), value: 1 },
  { name: t("userInfo.genderTypes.male"), value: 2 },
  { name: t("userInfo.genderTypes.female"), value: 3 },
  { name: t("userInfo.genderTypes.robot"), value: 4 },
  { name: t("userInfo.genderTypes.other"), value: 5 },
]);

const showGenderSheet = ref(false);
const showBirthdayPopup = ref(false);

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) || fallback;
  } catch {
    return fallback;
  }
};

const form = reactive({
  username: "",
  info: "",
  gender: null as number | null,
  birthday: null as Date | null,
  phone: "",
  email: "",
  address: "",
});

let originalUserInfo: UserInfo | null = null;

const birthdayPickerValue = ref([String(new Date().getFullYear()), "1", "1"]);

const genderLabel = computed(() => {
  if (form.gender === null || form.gender === undefined) return "";
  const opt = genderOptions.value.find((g) => g.value === form.gender);
  return opt?.name || "";
});

const birthdayLabel = computed(() => {
  if (!form.birthday) return "";
  const d = form.birthday;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
});

function populateForm(info: UserInfo) {
  originalUserInfo = { ...info };
  form.username = info.username || "";
  form.info = info.info || "";
  form.gender = info.gender ?? null;
  form.birthday = info.birthday ? new Date(info.birthday * 1000) : null;
  if (form.birthday) {
    birthdayPickerValue.value = [
      String(form.birthday.getFullYear()),
      String(form.birthday.getMonth() + 1),
      String(form.birthday.getDate()),
    ];
  }
  form.phone = info.phone || "";
  form.email = info.email || "";
  form.address = info.address || "";
}

onMounted(async () => {
  if (userInfo.value) {
    populateForm(userInfo.value);
    if (userInfo.value.icon) {
      avatarUrl.value = await getAvatarUrl(userInfo.value.icon);
    }
  } else {
    loadUserInfo();
    const unwatch = setInterval(async () => {
      if (userInfo.value) {
        populateForm(userInfo.value);
        if (userInfo.value.icon) {
          avatarUrl.value = await getAvatarUrl(userInfo.value.icon);
        }
        clearInterval(unwatch);
      }
    }, 100);
  }
});

const onBack = () => {
  if (uploading.value) {
    uploadCancelled = true;
    closeToast();
    uploading.value = false;
    previewUrl.value = null;
    showToast({ message: t("userInfo.edit.uploadCancelled"), icon: "none" });
    return;
  }
  router.back();
};

const onAvatarClick = () => {
  pickAndUploadAvatar();
};

const pickAndUploadAvatar = async () => {
  uploadCancelled = false;
  try {
    if (!userInfo.value) {
      showToast({ message: t("userInfo.edit.loginRequired"), icon: "fail" });
      return;
    }

    const files = await selectFile(false);
    if (!files || files.length === 0) return;

    let filePath = files[0];
    console.log("[DEBUG] Selected file:", filePath);

    // 处理 Android content:// URI
    if (filePath.startsWith("content://")) {
      showLoadingToast({
        message: t("userInfo.edit.readingFile"),
        forbidClick: true,
        duration: 0,
      });

      console.log("[DEBUG] Detected content URI, starting read...");

      try {
        const { tempPath } = await resolveContentToTempFile(filePath);
        filePath = tempPath;
        console.log("[DEBUG] Success! Resolved to:", filePath);
        closeToast();
      } catch (error) {
        const errMsg = getErrorMessage(error, "Unknown error");
        console.error("[DEBUG] ERROR:", error);
        console.error(
          "[DEBUG] ERROR stack:",
          error instanceof Error ? error.stack : undefined
        );
        closeToast();
        showToast({
          message: t("userInfo.edit.readFailed", {
            error: errMsg || "Unknown error",
          }),
          icon: "fail",
        });
        return;
      }
    }

    const rect = await startCrop(filePath);
    if (!rect) return;

    uploading.value = true;
    showLoadingToast({
      message: t("groupSettings.avatar.cropping"),
      forbidClick: true,
      duration: 0,
    });

    const compressedResult = await invoke<string>("crop_image_to_webp_command", {
      inputPath: filePath,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      outputSize: 512,
    });

    if (uploadCancelled) return;

    console.log("Cropped result:", compressedResult);

    const preview = convertPathToTauriUrl(compressedResult);
    if (preview) {
      previewUrl.value = preview;
    }

    closeToast();
    showLoadingToast({
      message: t("userInfo.edit.uploading"),
      forbidClick: true,
      duration: 0,
    });

    const uploadResult = await invoke<{ status: number; body: string }>(
      "upload_file_request",
      {
        url: `${getApiBase()}/file_integrated/upload/user_avatar`,
        filePath: compressedResult,
        fieldName: "file",
      }
    );

    if (uploadCancelled) return;

    closeToast();
    console.log("Upload result:", uploadResult);

    if (isHttpSuccess(uploadResult.status)) {
      const responseBody = uploadResult.body
        ? JSON.parse(uploadResult.body)
        : null;
      console.log("Response body:", responseBody);
      if (responseBody && isBackendSuccess(responseBody.code) && responseBody.data) {
        try {
          const res: { status: number; body: string } = await invoke(
            "post_request",
            {
              url: getApiBase() + "/user/me",
              body: "",
            }
          );
          const meData = JSON.parse(res.body);
          if (isBackendSuccess(meData.code) && meData.data) {
            const info: UserInfo = meData.data;
            setUserInfo(info);
            await cache_user_info(info).catch(() => null);
          }
        } catch (e) {
          console.error("获取用户信息失败:", e);
        }

        if (userInfo.value?.icon) {
          avatarUrl.value = await getAvatarUrl(userInfo.value.icon).catch(
            () => null
          );
        }

        showToast({ message: t("userInfo.avatar.updateSuccess"), icon: "success" });
      } else {
        const errorMsg =
          responseBody?.msg ||
          responseBody?.message ||
          t("userInfo.avatar.updateFailed");
        console.error("Server error:", errorMsg);
        showToast({
          message: errorMsg || t("userInfo.avatar.updateFailed"),
          icon: "fail",
        });
      }
    } else {
      console.error("HTTP error:", uploadResult.status, uploadResult.body);
      showToast({
        message: t("userInfo.edit.uploadFailedStatus", {
          status: uploadResult.status,
          body: uploadResult.body,
        }),
        icon: "fail",
      });
    }
  } catch (error) {
    if (uploadCancelled) return;
    closeToast();
    console.error("Upload error:", error);
    showToast({
      message: getErrorMessage(error, t("userInfo.avatar.updateFailed")),
      icon: "fail",
    });
  } finally {
    if (!uploadCancelled) {
      uploading.value = false;
      previewUrl.value = null;
    }
  }
};

const onGenderSelect = ({ value }: { value: number }) => {
  form.gender = value;
  showGenderSheet.value = false;
};

const onBirthdayConfirm = ({
  selectedValues,
}: {
  selectedValues: string[];
}) => {
  const [year, month, day] = selectedValues.map(Number);
  form.birthday = new Date(year, month - 1, day);
  birthdayPickerValue.value = selectedValues;
  showBirthdayPopup.value = false;
};

const onSave = async () => {
  if (!originalUserInfo) {
    showToast({ message: t("userInfo.edit.notLoaded"), icon: "fail" });
    return;
  }

  saving.value = true;

  try {
    const updateData: {
      username?: string;
      info?: string;
      gender?: number | null;
      age?: number;
      birthday?: number;
      phone?: string;
      email?: string;
      address?: string;
    } = {};

    const newUsername = form.username || undefined;
    if (newUsername !== (originalUserInfo.username || undefined)) {
      updateData.username = newUsername;
    }

    const newInfo = form.info || undefined;
    if (newInfo !== (originalUserInfo.info || undefined)) {
      updateData.info = newInfo;
    }

    const newGender = form.gender;
    if (newGender !== (originalUserInfo.gender ?? undefined)) {
      updateData.gender = newGender;
    }

    const newBirthday = form.birthday
      ? Math.floor(form.birthday.getTime() / 1000)
      : undefined;
    if (newBirthday !== (originalUserInfo.birthday ?? undefined)) {
      updateData.birthday = newBirthday;
    }

    const newPhone = form.phone || undefined;
    if (newPhone !== (originalUserInfo.phone || undefined)) {
      updateData.phone = newPhone;
    }

    const newEmail = form.email || undefined;
    if (newEmail !== (originalUserInfo.email || undefined)) {
      updateData.email = newEmail;
    }

    const newAddress = form.address || undefined;
    if (newAddress !== (originalUserInfo.address || undefined)) {
      updateData.address = newAddress;
    }

    if (Object.keys(updateData).length === 0) {
      showToast({ message: t("userInfo.edit.noChanges"), icon: "info" });
      saving.value = false;
      return;
    }

    const result = await invoke<string>("update_user_info_command", {
      updateDto: updateData,
    });

    const response = result ? JSON.parse(result) : null;
    if (response && isBackendSuccess(response.code)) {
      const updatedInfo = {
        ...originalUserInfo,
        ...updateData,
        birthday: updateData.birthday ?? originalUserInfo.birthday,
      };
      setUserInfo(updatedInfo as UserInfo);

      try {
        await invoke("cache_user_info", { userInfo: updatedInfo });
      } catch {
        /* 缓存失败不影响主流程 */
      }

      showToast({ message: t("userInfo.edit.updateSuccess"), icon: "success" });
      setTimeout(() => router.back(), 800);
    } else {
      showToast({
        message: response.message || t("userInfo.edit.updateFailed"),
        icon: "fail",
      });
    }
  } catch (error) {
    showToast({
      message: getErrorMessage(error, t("userInfo.edit.updateFailed")),
      icon: "fail",
    });
    saving.value = false;
  }
};
</script>

<template>
  <div class="edit-profile-page">
    <van-nav-bar
      :title="uploading ? t('userInfo.edit.uploadingAvatar') : t('userInfo.edit.edit')"
      :left-text="uploading ? t('common.cancel') : t('common.back')"
      left-arrow
      @click-left="onBack"
    />

    <div class="avatar-section" @click="onAvatarClick">
      <div class="avatar-wrapper" :class="{ uploading }">
        <img
          :src="previewUrl || avatarUrl || DEFAULT_AVATAR"
          alt="avatar"
          class="edit-avatar"
          @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
        />
        <div v-if="uploading" class="upload-overlay">
          <svg class="spin-icon" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="3"
              stroke-dasharray="31.4 31.4"
            />
          </svg>
        </div>
        <div v-else class="avatar-badge">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 15.2c1.98 0 3.6-1.62 3.6-3.6s-1.62-3.6-3.6-3.6-3.6 1.62-3.6 3.6 1.62 3.6 3.6 3.6zM9 2l1.83 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-1.83L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
            />
          </svg>
        </div>
      </div>
      <p class="avatar-hint">{{ t("userInfo.edit.changeAvatarHint") }}</p>
    </div>

    <div class="form-section">
      <van-form @submit="onSave">
        <van-field
          v-model="form.username"
          name="username"
          :label="t('userInfo.username')"
          :placeholder="t('userInfo.edit.usernamePlaceholder')"
          maxlength="50"
          clearable
        />

        <van-field
          v-model="form.info"
          name="info"
          :label="t('userInfo.info')"
          :placeholder="t('userInfo.edit.infoPlaceholder')"
          type="textarea"
          rows="2"
          autosize
          maxlength="200"
          show-word-limit
        />

        <van-field
          v-model="genderLabel"
          name="gender"
          :label="t('userInfo.gender')"
          :placeholder="t('userInfo.edit.selectGender')"
          readonly
          is-link
          @click="showGenderSheet = true"
        />

        <van-field
          v-model="birthdayLabel"
          name="birthday"
          :label="t('userInfo.birthday')"
          :placeholder="t('userInfo.edit.selectBirthday')"
          readonly
          is-link
          @click="showBirthdayPopup = true"
        />

        <van-field
          v-model="form.phone"
          name="phone"
          :label="t('userInfo.phone')"
          :placeholder="t('userInfo.edit.phonePlaceholder')"
          type="tel"
          maxlength="11"
          clearable
        />

        <van-field
          v-model="form.email"
          name="email"
          :label="t('userInfo.email')"
          :placeholder="t('userInfo.edit.emailPlaceholder')"
          type="email"
          clearable
        />

        <van-field
          v-model="form.address"
          name="address"
          :label="t('userInfo.address')"
          :placeholder="t('userInfo.edit.addressPlaceholder')"
          maxlength="200"
          clearable
        />

        <div class="submit-section">
          <van-button
            block
            type="primary"
            native-type="submit"
            :loading="saving"
            round
          >
            {{ t("userInfo.edit.save") }}
          </van-button>
        </div>
      </van-form>
    </div>

    <van-action-sheet
      v-model:show="showGenderSheet"
      :actions="genderOptions.map((g) => ({ name: g.name, value: g.value }))"
      @select="onGenderSelect"
      :cancel-text="t('common.cancel')"
    />

    <van-popup v-model:show="showBirthdayPopup" position="bottom">
      <van-date-picker
        :model-value="birthdayPickerValue"
        type="date"
        :min-date="new Date(1900, 0, 1)"
        :max-date="new Date()"
        @confirm="onBirthdayConfirm"
        @cancel="showBirthdayPopup = false"
      />
    </van-popup>

    <AvatarCropPopup
      :show="cropShow"
      :src="cropSrc"
      @cancel="onCropCancel"
      @confirm="onCropConfirm"
    />
  </div>
</template>

<style scoped lang="less">
.edit-profile-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;
}

:deep(.van-nav-bar) {
  position: sticky;
  top: 0;
  z-index: 100;
}

.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0 20px;
  cursor: pointer;
  &:active {
    opacity: 0.8;
  }
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.edit-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid var(--border-strong);
  box-shadow: var(--shadow-sm);
  object-fit: cover;
  display: block;
}

.avatar-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 26px;
  height: 26px;
  background: var(--brand-blue);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border-strong);
  svg {
    width: 15px;
    height: 15px;
    color: #fff;
  }
}

.upload-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.spin-icon {
  width: 28px;
  height: 28px;
  color: #fff;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.avatar-hint {
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.form-section {
  margin: 0 16px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);

  :deep(.van-cell-group) {
    margin: 0;
  }
}

.submit-section {
  padding: 20px 16px;
}
</style>
