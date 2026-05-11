<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { showDialog, showToast, showLoadingToast, closeToast } from "vant";
import { invoke } from "@tauri-apps/api/core";
import { selectFile, convertPathToTauriUrl, getFiles } from "@workspace/services";
import { TALK_API } from "@workspace/types";
import type { UserInfo } from "@workspace/types";
import { useAuthStore } from "@/stores/auth";
import { useUserStore, DEFAULT_AVATAR } from "@/stores/user";
import { getMyAccount } from "@/utils/api";

const router = useRouter();
const { clearAuth } = useAuthStore();
const { userInfo, avatarUrl, loadUserInfo, setUserInfo, setAvatarUrl } = useUserStore();

const previewUrl = ref<string | null>(null);
const uploading = ref(false);
const account = ref("");

onMounted(async () => {
  try {
    const acc = await getMyAccount();
    account.value = acc;
  } catch { /* ignore */ }
  loadUserInfo();
});

watch(userInfo, async (info) => {
  if (info?.icon) {
    try {
      const files = await getFiles(info.icon);
      setAvatarUrl(files?.[0]?.tauri_file_path || null);
    } catch {
      setAvatarUrl(null);
    }
  } else {
    setAvatarUrl(null);
  }
}, { immediate: true });

const onAvatarClick = () => {
  pickAndUploadAvatar();
};

const pickAndUploadAvatar = async () => {
  try {
    const files = await selectFile(false);
    if (!files || files.length === 0) return;

    const filePath = files[0];
    uploading.value = true;
    showLoadingToast({ message: "压缩中...", forbidClick: true, duration: 0 });

    const compressedResult = await invoke<string>("compress_image_to_webp_command", {
      inputPath: filePath,
    });

    const preview = convertPathToTauriUrl(compressedResult);
    if (preview) {
      previewUrl.value = preview;
    }

    closeToast();
    showLoadingToast({ message: "上传中...", forbidClick: true, duration: 0 });

    const uploadResult = await invoke<{ status: number; body: string }>("upload_file_request", {
      url: `${TALK_API}/file_integrated/upload/user_avatar`,
      filePath: compressedResult,
      fieldName: "file",
    });

    closeToast();

    if (uploadResult.status === 200) {
      const responseBody = JSON.parse(uploadResult.body);
      if (responseBody.code === 200 && responseBody.data) {
        const bizId = responseBody.data;

        const fileVos = await getFiles(bizId);
        const tauriFilePath = fileVos?.[0]?.tauri_file_path || null;

        if (tauriFilePath) {
          const updatedInfo = { ...(userInfo.value || {}), icon: bizId } as UserInfo;
          setUserInfo(updatedInfo);
          setAvatarUrl(tauriFilePath);
          showToast({ message: "头像更新成功", icon: "success" });
        } else {
          showToast({ message: "头像更新成功，刷新后生效", icon: "success" });
          setUserInfo({ icon: bizId } as UserInfo);
        }
      } else {
        showToast({ message: responseBody.msg || "头像更新失败", icon: "fail" });
      }
    } else {
      showToast({ message: "头像更新失败", icon: "fail" });
    }
  } catch (error: any) {
    closeToast();
    console.error("头像更新失败:", error);
    showToast({ message: error.message || "头像更新失败", icon: "fail" });
  } finally {
    uploading.value = false;
    previewUrl.value = null;
  }
};

const menuItems = [
  { icon: "setting", name: "设置" },
  { icon: "notify", name: "消息通知" },
  { icon: "privacy", name: "隐私与安全" },
  { icon: "about", name: "关于 Only Talk" },
];

const onMenuClick = () => {
  showDialog({ title: "提示", message: "该功能开发中", confirmButtonText: "知道了", confirmButtonColor: "#4a90ff" });
};

const onLogout = () => {
  showDialog({
    title: "退出登录", message: "确定要退出登录吗？",
    confirmButtonText: "退出", confirmButtonColor: "#ef4444", cancelButtonText: "取消",
  }).then(() => {
    clearAuth();
    showToast({ message: "已退出登录", icon: "success" });
    router.replace("/login");
  }).catch(() => {});
};
</script>

<template>
  <div class="profile-page">
    <div class="header"><h1 class="title">我的</h1></div>

    <div class="user-card">
      <div class="user-bg"></div>
      <div class="user-content" @click="onAvatarClick">
        <div class="avatar-wrapper" :class="{ uploading }">
          <img
            :src="previewUrl || avatarUrl || DEFAULT_AVATAR"
            alt="avatar"
            class="user-avatar"
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
          <div v-if="uploading" class="upload-overlay">
            <svg class="spin-icon" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" />
            </svg>
          </div>
          <div v-else class="avatar-badge">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15.2c1.98 0 3.6-1.62 3.6-3.6s-1.62-3.6-3.6-3.6-3.6 1.62-3.6 3.6 1.62 3.6 3.6 3.6zM9 2l1.83 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-1.83L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" /></svg>
          </div>
        </div>
        <div class="user-info">
          <h2 class="user-name">{{ userInfo?.username || account || "用户" }}</h2>
          <p class="user-account">账号: {{ userInfo?.account || account }}</p>
          <p v-if="userInfo?.info" class="user-bio">{{ userInfo.info }}</p>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
      </div>
    </div>

    <div class="menu-section">
      <div v-for="item in menuItems" :key="item.name" class="menu-item" @click="onMenuClick">
        <div class="menu-left">
          <svg v-if="item.icon==='setting'" viewBox="0 0 24 24" fill="currentColor" class="menu-icon"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
          <svg v-else-if="item.icon==='notify'" viewBox="0 0 24 24" fill="currentColor" class="menu-icon"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" /></svg>
          <svg v-else-if="item.icon==='privacy'" viewBox="0 0 24 24" fill="currentColor" class="menu-icon"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" /></svg>
          <svg v-else-if="item.icon==='about'" viewBox="0 0 24 24" fill="currentColor" class="menu-icon"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>
          <span class="menu-name">{{ item.name }}</span>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
      </div>
    </div>

    <div class="logout-section">
      <button class="logout-btn" @click="onLogout">退出登录</button>
    </div>
  </div>
</template>

<style scoped lang="less">
.profile-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 80px;
}

.header {
  padding: 16px 20px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky; top: 0; z-index: 50;
  border-bottom: 1px solid var(--border-light);
}

.title { font-size: 28px; font-weight: 700; color: var(--text-primary); margin: 0; }

.user-card {
  margin: 16px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  border: 1px solid var(--border-medium);
  box-shadow: var(--shadow-sm);
}

.user-bg {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, var(--blue-100), var(--blue-50));
}

.user-content {
  position: relative;
  display: flex; align-items: center; gap: 16px;
  padding: 20px; cursor: pointer;
  &:active { background: rgba(74, 144, 255, 0.04); }
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.user-avatar {
  width: 64px; height: 64px;
  border-radius: 50%;
  border: 3px solid var(--border-strong);
  box-shadow: var(--shadow-sm);
  object-fit: cover;
  display: block;
}

.avatar-badge {
  position: absolute; bottom: -2px; right: -2px;
  width: 24px; height: 24px;
  background: var(--brand-blue);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--border-strong);
  svg { width: 14px; height: 14px; color: #fff; }
}

.upload-overlay {
  position: absolute; inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}

.spin-icon {
  width: 28px; height: 28px;
  color: #fff;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.user-info { flex: 1; min-width: 0; }
.user-name { font-size: 18px; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
.user-account { font-size: 13px; color: var(--text-tertiary); margin: 0; }
.user-bio { font-size: 12px; color: var(--text-secondary); margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arrow { width: 20px; height: 20px; color: var(--text-placeholder); flex-shrink: 0; }

.menu-section {
  margin: 0 16px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.menu-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--transition-fast);
  &:last-child { border-bottom: none; }
  &:active { background: var(--surface-hover); }
}

.menu-left { display: flex; align-items: center; gap: 14px; }
.menu-icon { width: 22px; height: 22px; color: var(--brand-blue); flex-shrink: 0; }
.menu-name { font-size: 15px; color: var(--text-primary); }

.logout-section { padding: 24px 16px; text-align: center; }

.logout-btn {
  width: 100%; max-width: 300px; height: 48px;
  background: var(--surface);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 15px; font-weight: 500; cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-xs);
  &:active { background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.4); }
}
</style>
