<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast, showLoadingToast, closeToast } from "vant";
import { invoke } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  selectFile,
  convertPathToTauriUrl,
  cache_user_info,
} from "@workspace/services";
import { TALK_API } from "@workspace/types";
import type { UserInfo } from "@workspace/types";
import { useUserStore, DEFAULT_AVATAR } from "@/stores/user";
import { useAvatar } from "@/hooks/useAvatar";

const router = useRouter();
const { userInfo, loadUserInfo, setUserInfo } = useUserStore();
const { getAvatarUrl } = useAvatar();

const saving = ref(false);
const uploading = ref(false);
const previewUrl = ref<string | null>(null);
const avatarUrl = ref<string | null>(null);
let uploadCancelled = false;

const genderOptions = [
  { name: "未知", value: 0 },
  { name: "保密", value: 1 },
  { name: "男", value: 2 },
  { name: "女", value: 3 },
  { name: "机器人", value: 4 },
  { name: "其他", value: 5 },
];

const showGenderSheet = ref(false);
const showBirthdayPopup = ref(false);

const form = reactive({
  username: "",
  info: "",
  gender: null as number | null,
  age: "",
  birthday: null as Date | null,
  phone: "",
  email: "",
  address: "",
});

let originalUserInfo: UserInfo | null = null;

const birthdayPickerValue = ref([String(new Date().getFullYear()), "1", "1"]);

const genderLabel = computed(() => {
  if (form.gender === null || form.gender === undefined) return "";
  const opt = genderOptions.find((g) => g.value === form.gender);
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
  form.age = info.age != null ? String(info.age) : "";
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
    showToast({ message: "已取消上传", icon: "none" });
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
      showToast({ message: "请先登录", icon: "fail" });
      return;
    }

    const files = await selectFile(false);
    if (!files || files.length === 0) return;

    let filePath = files[0];
    console.log("[DEBUG] Selected file:", filePath);

    // 处理 Android content:// URI
    if (filePath.startsWith("content://")) {
      showLoadingToast({ message: "读取文件中...", forbidClick: true, duration: 0 });
      
      console.log("[DEBUG] Detected content URI, starting read...");
      
      try {
        // 使用 fetch API 读取 content URI
        console.log("[DEBUG] Trying fetch:", filePath);
        const response = await fetch(filePath);
        console.log("[DEBUG] Fetch response status:", response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        console.log("[DEBUG] Blob size:", blob.size, "type:", blob.type);
        
        const buffer = await blob.arrayBuffer();
        const fileData = new Uint8Array(buffer);
        console.log("[DEBUG] ArrayBuffer size:", fileData.length);
        
        // 写入临时文件
        const timestamp = Date.now();
        const tempPath = `umi_gitee_temp/avatar_${timestamp}.jpg`;
        console.log("[DEBUG] Writing to temp file:", tempPath);
        
        await writeFile(tempPath, fileData);
        filePath = tempPath;
        console.log("[DEBUG] Success! Resolved to:", filePath);
      } catch (error: any) {
        console.error("[DEBUG] ERROR:", error?.message || error?.toString() || error);
        console.error("[DEBUG] ERROR stack:", error?.stack);
        closeToast();
        showToast({ 
          message: `读取失败: ${error?.message || 'Unknown error'}`, 
          icon: "fail" 
        });
        return;
      }
    }

    uploading.value = true;
    showLoadingToast({ message: "压缩中...", forbidClick: true, duration: 0 });

    const compressedResult = await invoke<string>(
      "compress_image_to_webp_command",
      {
        inputPath: filePath,
      }
    );
    
    if (uploadCancelled) return;
    
    console.log("Compressed result:", compressedResult);

    const preview = convertPathToTauriUrl(compressedResult);
    if (preview) {
      previewUrl.value = preview;
    }

    closeToast();
    showLoadingToast({ message: "上传中...", forbidClick: true, duration: 0 });

    const uploadResult = await invoke<{ status: number; body: string }>(
      "upload_file_request",
      {
        url: `${TALK_API}/file_integrated/upload/user_avatar`,
        filePath: compressedResult,
        fieldName: "file",
      }
    );

    if (uploadCancelled) return;

    closeToast();
    console.log("Upload result:", uploadResult);

    if (uploadResult.status === 200) {
      const responseBody = JSON.parse(uploadResult.body);
      console.log("Response body:", responseBody);
      if (responseBody.code === 200 && responseBody.data) {
        try {
          const res: { status: number; body: string } = await invoke("post_request", {
            url: TALK_API + "/user/me",
            body: "",
          });
          const meData = JSON.parse(res.body);
          if (meData.code === 200 && meData.data) {
            const info: UserInfo = meData.data;
            setUserInfo(info);
            await cache_user_info(info).catch(() => null);
          }
        } catch (e) {
          console.error("获取用户信息失败:", e);
        }

        if (userInfo.value?.icon) {
          avatarUrl.value = await getAvatarUrl(userInfo.value.icon).catch(() => null);
        }
        
        showToast({ message: "头像更新成功", icon: "success" });
      } else {
        const errorMsg =
          responseBody.msg ||
          responseBody.message ||
          JSON.stringify(responseBody);
        console.error("Server error:", errorMsg);
        showToast({ message: errorMsg || "头像更新失败", icon: "fail" });
      }
    } else {
      console.error("HTTP error:", uploadResult.status, uploadResult.body);
      showToast({
        message: `上传失败(${uploadResult.status}): ${uploadResult.body}`,
        icon: "fail",
      });
    }
  } catch (error: any) {
    if (uploadCancelled) return;
    closeToast();
    console.error("Upload error:", error);
    showToast({
      message: error.message || error.toString() || "头像更新失败",
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
    showToast({ message: "用户信息未加载", icon: "fail" });
    return;
  }

  saving.value = true;

  try {
    const updateData: Record<string, any> = {};

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

    const newAge = form.age ? Number(form.age) : undefined;
    if (newAge !== (originalUserInfo.age ?? undefined)) {
      updateData.age = newAge;
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
      showToast({ message: "没有修改任何信息", icon: "info" });
      saving.value = false;
      return;
    }

    const result = await invoke<string>("update_user_info_command", {
      updateDto: updateData,
    });

    const response = JSON.parse(result);
    if (response.code === 200) {
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

      showToast({ message: "用户信息更新成功", icon: "success" });
      setTimeout(() => router.back(), 800);
    } else {
      showToast({ message: response.message || "更新失败", icon: "fail" });
    }
  } catch (error: any) {
    showToast({ message: error.message || "更新失败", icon: "fail" });
    saving.value = false;
  }
};
</script>

<template>
  <div class="edit-profile-page">
    <van-nav-bar
      :title="uploading ? '上传头像中' : '编辑资料'"
      :left-text="uploading ? '取消' : '返回'"
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
      <p class="avatar-hint">点击更换头像</p>
    </div>

    <div class="form-section">
      <van-form @submit="onSave">
        <van-field
          v-model="form.username"
          name="username"
          label="用户名"
          placeholder="请输入用户名"
          maxlength="50"
          clearable
        />

        <van-field
          v-model="form.info"
          name="info"
          label="个人简介"
          placeholder="介绍一下自己"
          type="textarea"
          rows="2"
          autosize
          maxlength="200"
          show-word-limit
        />

        <van-field
          v-model="genderLabel"
          name="gender"
          label="性别"
          placeholder="请选择性别"
          readonly
          is-link
          @click="showGenderSheet = true"
        />

        <van-field
          v-model="form.age"
          name="age"
          label="年龄"
          placeholder="请输入年龄"
          type="digit"
          clearable
        />

        <van-field
          v-model="birthdayLabel"
          name="birthday"
          label="生日"
          placeholder="请选择生日"
          readonly
          is-link
          @click="showBirthdayPopup = true"
        />

        <van-field
          v-model="form.phone"
          name="phone"
          label="手机号"
          placeholder="请输入手机号"
          type="tel"
          maxlength="11"
          clearable
        />

        <van-field
          v-model="form.email"
          name="email"
          label="邮箱"
          placeholder="请输入邮箱"
          type="email"
          clearable
        />

        <van-field
          v-model="form.address"
          name="address"
          label="地址"
          placeholder="请输入地址"
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
            保存
          </van-button>
        </div>
      </van-form>
    </div>

    <van-action-sheet
      v-model:show="showGenderSheet"
      :actions="genderOptions.map((g) => ({ name: g.name, value: g.value }))"
      @select="onGenderSelect"
      cancel-text="取消"
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
