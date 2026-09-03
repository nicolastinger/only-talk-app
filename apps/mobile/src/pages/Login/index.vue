<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import {
  showToast,
  showLoadingToast,
  closeToast,
  showConfirmDialog,
  Overlay,
} from "vant";
import type { HttpResponse, ResponseData, UserInfo } from "@workspace/types";
import { TALK_API } from "@workspace/types";
import {
  getFiles,
  get_cached_user_info_by_account,
  get_cached_user_info,
  search_user_by_account,
  cache_user_info,
  get_quic_servers,
} from "@workspace/services";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const { setLoggedIn, clearAuth } = useAuthStore();

const form = reactive({ account: "", password: "" });
const agreed = ref(false);
const loading = ref(false);
const showPrivacy = ref(false);
const privacyContent = ref("");
const accountError = ref("");
const passwordError = ref("");

const accountAvatar = ref<string | null>(null);
const searchingAvatar = ref(false);

interface QuickLoginUser {
  user_id: string;
  username: string | null;
  account: string | null;
  icon: string | null;
  refresh_token: string | null;
  updated_at: number | null;
}

const quickUsers = ref<QuickLoginUser[]>([]);
const currentUserIndex = ref(0);
const quickLoginLoading = ref(false);
const showQuickLogin = ref(true);
const currentAvatar = ref<string | null>(null);
const avatarCache = new Map<string, string | null>();

const currentQuickUser = computed(
  () => quickUsers.value[currentUserIndex.value] ?? null
);
const currentUserName = computed(
  () =>
    currentQuickUser.value?.username ||
    currentQuickUser.value?.account ||
    "用户"
);

const resolveAvatarFromIcon = async (
  icon: string | null
): Promise<string | null> => {
  if (!icon) return null;
  if (avatarCache.has(icon)) return avatarCache.get(icon)!;
  try {
    const files = await getFiles(icon);
    const url = files?.[0]?.tauri_file_path || null;
    avatarCache.set(icon, url);
    return url;
  } catch {
    avatarCache.set(icon, null);
    return null;
  }
};

const loadQuickUsers = async () => {
  try {
    const users: QuickLoginUser[] = await invoke("get_quick_login_users");
    quickUsers.value = users;
    if (users.length) {
      currentUserIndex.value = 0;
      currentAvatar.value = await resolveAvatarFromIcon(users[0].icon);
    }
  } catch (e) {
    console.log("加载免登录用户失败", e);
  }
};

const selectQuickUser = async (idx: number) => {
  if (idx < 0 || idx >= quickUsers.value.length) return;
  currentUserIndex.value = idx;
  const user = quickUsers.value[idx];
  currentAvatar.value = await resolveAvatarFromIcon(user.icon);
};

const handlePrevUser = () => {
  const len = quickUsers.value.length;
  if (len <= 1) return;
  selectQuickUser((currentUserIndex.value - 1 + len) % len);
};

const handleNextUser = () => {
  const len = quickUsers.value.length;
  if (len <= 1) return;
  selectQuickUser((currentUserIndex.value + 1) % len);
};

const handleDeleteUser = async () => {
  const user = currentQuickUser.value;
  if (!user?.user_id) return;
  try {
    await showConfirmDialog({
      title: "删除账号",
      message: `确定删除「${user.username || user.account}」的免登录记录吗？`,
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      confirmButtonColor: "#ef4444",
    });
  } catch {
    return;
  }
  try {
    await invoke("delete_quick_login_user", { userId: user.user_id });
    const next = quickUsers.value.filter((u) => u.user_id !== user.user_id);
    quickUsers.value = next;
    if (!next.length) {
      currentAvatar.value = null;
      showQuickLogin.value = false;
      return;
    }
    const idx =
      currentUserIndex.value >= next.length ? 0 : currentUserIndex.value;
    currentUserIndex.value = idx;
    currentAvatar.value = await resolveAvatarFromIcon(next[idx].icon);
    showToast({ message: "已删除", icon: "success" });
  } catch {
    showToast({ message: "删除失败", icon: "fail" });
  }
};

const handleQuickLogin = async () => {
  const user = currentQuickUser.value;
  if (!user?.refresh_token) return;
  quickLoginLoading.value = true;
  const failQuickLogin = () => {
    showQuickLogin.value = false;
    showToast({ message: "免登录失败，请手动登录", icon: "fail" });
  };
  try {
    const response: HttpResponse = await invoke("quick_login", {
      refreshToken: user.refresh_token,
      url: TALK_API,
    });
    const data: ResponseData = JSON.parse(response.body);
    if (data.code === 200) {
      await enterApp();
    } else {
      failQuickLogin();
    }
  } catch (error) {
    console.log(error);
    failQuickLogin();
  } finally {
    quickLoginLoading.value = false;
  }
};

const toPasswordLogin = () => {
  showQuickLogin.value = false;
  accountAvatar.value = null;
};

const toQuickLogin = async () => {
  showQuickLogin.value = true;
  const user = currentQuickUser.value;
  if (user) {
    currentAvatar.value = await resolveAvatarFromIcon(user.icon);
  }
};

const toRegister = () => {
  router.push("/signup");
};

const validateAccount = (value: string): boolean => {
  if (!value) {
    accountError.value = "请输入账号";
    return false;
  }
  if (value.length < 5) {
    accountError.value = "账号至少5个字符";
    return false;
  }
  accountError.value = "";
  return true;
};
const validatePassword = (value: string): boolean => {
  if (!value) {
    passwordError.value = "请输入密码";
    return false;
  }
  if (value.length < 8) {
    passwordError.value = "密码至少8个字符";
    return false;
  }
  passwordError.value = "";
  return true;
};
const onAccountInput = async () => {
  if (accountError.value) validateAccount(form.account);
  const matched = quickUsers.value.find(
    (u) => u.account === form.account || u.username === form.account
  );
  accountAvatar.value = matched
    ? await resolveAvatarFromIcon(matched.icon)
    : null;
};
const onAccountBlur = async () => {
  if (!validateAccount(form.account)) return;
  if (searchingAvatar.value) return;
  const matched = quickUsers.value.find(
    (u) => u.account === form.account || u.username === form.account
  );
  if (matched) {
    accountAvatar.value = await resolveAvatarFromIcon(matched.icon);
    return;
  }
  searchingAvatar.value = true;
  try {
    let userInfo = await get_cached_user_info_by_account(form.account);
    if (!userInfo) {
      const result: any = await search_user_by_account(form.account);
      userInfo = result?.data ?? result;
    }
    if (userInfo?.icon) {
      accountAvatar.value = await resolveAvatarFromIcon(userInfo.icon);
    } else {
      accountAvatar.value = null;
    }
  } catch {
    accountAvatar.value = null;
  } finally {
    searchingAvatar.value = false;
  }
};
const onPasswordInput = () => {
  if (passwordError.value) validatePassword(form.password);
};

const enterApp = async () => {
  setLoggedIn();

  get_quic_servers().then((servers) => {
    console.log("QUIC外网节点信息:", servers);
  });

  try {
    const res: HttpResponse = await invoke("post_request", {
      url: TALK_API + "/user/me",
      body: "",
    });
    const data: ResponseData = JSON.parse(res.body);
    if (data.code === 200 && data.data) {
      const info: UserInfo = data.data;
      const cached = await get_cached_user_info(info.uuid).catch(() => null);
      const isDifferent =
        !cached || JSON.stringify(cached) !== JSON.stringify(info);
      if (isDifferent) {
        await cache_user_info(info);
      }
    }
  } catch {
    /* cache user info silently */
  }

  closeToast();
  showToast({ message: "登录成功", icon: "success" });
  router.replace("/chats");
};

const onLogin = async () => {
  if (!validateAccount(form.account) || !validatePassword(form.password))
    return;
  if (!agreed.value) {
    showToast("请先阅读并同意隐私政策");
    return;
  }
  loading.value = true;
  showLoadingToast({ message: "登录中...", forbidClick: true, duration: 0 });

  try {
    const response: HttpResponse = await invoke("sign_in", {
      url: TALK_API + "/user/sign_in",
      body: {
        account: form.account,
        password: form.password,
        platform: "MOBILE",
      },
    });
    const data: ResponseData = JSON.parse(response.body);

    if (data.code === 200) {
      await enterApp();
    } else {
      closeToast();
      showToast({ message: "账号或密码错误", icon: "fail" });
    }
  } catch (error: unknown) {
    closeToast();
    if (error != null && typeof error === "string") {
      try {
        if (JSON.parse(error).code === 500) {
          showToast({ message: "账号或密码错误", icon: "fail" });
          return;
        }
      } catch {}
    }
    showToast({ message: "网络请求失败，请检查网络", icon: "fail" });
  } finally {
    loading.value = false;
  }
};

const loadPrivacyMd = async () => {
  try {
    privacyContent.value = await (await fetch("/markdown/privacy.md")).text();
  } catch {
    privacyContent.value = "隐私政策加载失败";
  }
};
const onOpenPrivacy = async () => {
  await loadPrivacyMd();
  showPrivacy.value = true;
};
onMounted(() => {
  clearAuth();
  accountAvatar.value = null;
  loadQuickUsers();
});
</script>

<template>
  <div class="login-page">
    <div class="login-bg">
      <div class="bg-blob bg-blob-1"></div>
      <div class="bg-blob bg-blob-2"></div>
      <div class="bg-blob bg-blob-3"></div>
    </div>
    <div class="login-container">
      <template v-if="showQuickLogin && quickUsers.length">
        <div class="quick-login-section">
          <div class="quick-avatar-row">
            <button
              v-if="quickUsers.length > 1"
              class="switch-btn"
              aria-label="上一个账号"
              @click="handlePrevUser"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <div class="avatar-box">
              <div class="app-logo">
                <img
                  v-if="currentAvatar"
                  :src="currentAvatar"
                  class="user-avatar-img"
                  alt="用户头像"
                  @error="currentAvatar = null"
                />
                <img
                  v-else
                  src="/images/default.jpg"
                  class="user-avatar-img"
                  alt="默认头像"
                />
              </div>
              <button
                class="delete-badge"
                aria-label="删除免登录账号"
                @click="handleDeleteUser"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <button
              v-if="quickUsers.length > 1"
              class="switch-btn"
              aria-label="下一个账号"
              @click="handleNextUser"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L12.17 12z" />
              </svg>
            </button>
          </div>
          <p class="quick-name">{{ currentUserName }}</p>
          <div v-if="quickUsers.length > 1" class="user-indicator">
            <span
              v-for="(u, idx) in quickUsers"
              :key="u.user_id"
              class="dot"
              :class="{ active: idx === currentUserIndex }"
              @click="selectQuickUser(idx)"
            ></span>
          </div>
          <button
            class="login-btn quick-btn"
            :disabled="quickLoginLoading"
            @click="handleQuickLogin"
          >
            <span v-if="quickLoginLoading" class="loading-dots"
              ><span class="dot"></span><span class="dot"></span
              ><span class="dot"></span
            ></span>
            <span v-else>一键登录</span>
          </button>
          <a class="switch-link" @click="toPasswordLogin">使用密码登录</a>
        </div>
      </template>
      <template v-else>
        <div class="logo-section">
        <div class="app-logo">
          <img
            v-if="accountAvatar"
            :src="accountAvatar"
            class="user-avatar-img"
            @error="accountAvatar = null"
          />
          <img
            v-else
            src="/images/default.jpg"
            class="user-avatar-img"
            alt="默认头像"
          />
        </div>
        <h1 class="app-name">Only Talk</h1>
        <p class="app-slogan">随时随地，畅快交流</p>
      </div>
      <div class="form-section">
        <div class="input-group">
          <div class="input-wrapper" :class="{ error: accountError }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
            <input
              type="text"
              v-model="form.account"
              class="form-input"
              placeholder="请输入账号"
              @input="onAccountInput"
              @blur="onAccountBlur"
            />
            <svg
              v-if="searchingAvatar"
              class="searching-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
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
          <span v-if="accountError" class="error-text">{{ accountError }}</span>
        </div>
        <div class="input-group">
          <div class="input-wrapper" :class="{ error: passwordError }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"
              />
            </svg>
            <input
              type="password"
              v-model="form.password"
              class="form-input"
              placeholder="请输入密码"
              @input="onPasswordInput"
              @blur="validatePassword(form.password)"
            />
          </div>
          <span v-if="passwordError" class="error-text">{{
            passwordError
          }}</span>
        </div>
        <div class="agreement-row">
          <label class="checkbox-label"
            ><input
              type="checkbox"
              v-model="agreed"
              class="agreement-checkbox" /><span class="checkmark"></span
          ></label>
          <span class="agreement-text"
            >已阅读并同意<a class="privacy-link" @click.prevent="onOpenPrivacy"
              >《隐私政策》</a
            ></span
          >
        </div>
        <button class="login-btn" :disabled="loading" @click="onLogin">
          <span v-if="loading" class="loading-dots"
            ><span class="dot"></span><span class="dot"></span
            ><span class="dot"></span
          ></span>
          <span v-else>登 录</span>
        </button>
        <div class="form-footer">
          <template v-if="quickUsers.length">
            <a class="switch-link" @click="toQuickLogin">免登录</a>
            <span class="divider">|</span>
          </template>
          <a class="switch-link" @click="toRegister">注册账号</a>
        </div>
      </div>
      </template>
    </div>
    <Overlay :show="showPrivacy" @click="showPrivacy = false">
      <div class="privacy-modal" @click.stop>
        <div class="privacy-header">
          <h2>隐私政策</h2>
          <button class="privacy-close" @click="showPrivacy = false">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>
        <div class="privacy-body" v-html="privacyContent"></div>
        <div class="privacy-footer">
          <button class="privacy-confirm" @click="showPrivacy = false">
            我知道了
          </button>
        </div>
      </div>
    </Overlay>
  </div>
</template>

<style scoped lang="less">
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: var(--page-bg);
}
.login-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.bg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}
.bg-blob-1 {
  width: 300px;
  height: 300px;
  background: rgba(74, 144, 255, 0.3);
  top: -10%;
  right: -20%;
  animation: blobFloat1 12s ease-in-out infinite;
}
.bg-blob-2 {
  width: 250px;
  height: 250px;
  background: rgba(99, 102, 241, 0.25);
  bottom: -5%;
  left: -15%;
  animation: blobFloat2 15s ease-in-out infinite;
}
.bg-blob-3 {
  width: 200px;
  height: 200px;
  background: rgba(126, 184, 255, 0.3);
  top: 50%;
  left: 30%;
  animation: blobFloat3 10s ease-in-out infinite;
}
@keyframes blobFloat1 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(-30px, 20px) scale(1.05);
  }
  66% {
    transform: translate(20px, -15px) scale(0.95);
  }
}
@keyframes blobFloat2 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(25px, -25px) scale(1.08);
  }
  66% {
    transform: translate(-15px, 15px) scale(0.93);
  }
}
@keyframes blobFloat3 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-20px, -20px) scale(1.1);
  }
}
.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 360px;
  padding: 0 28px;
}
.logo-section {
  text-align: center;
  margin-bottom: 40px;
}
.app-logo {
  width: 100px;
  height: 100px;
  margin: 0 auto 16px;
  background: var(--gradient-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-glow);
  overflow: hidden;
  svg {
    width: 36px;
    height: 36px;
    color: #fff;
  }
}
.user-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.app-name {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: 2px;
}
.app-slogan {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0;
}
.form-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--glass-bg);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-xs);
  &:focus-within {
    border-color: var(--brand-blue);
    box-shadow: var(--shadow-glow-sm);
    background: var(--glass-bg-dark);
  }
  &.error {
    border-color: var(--color-error);
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }
}
.input-icon {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.form-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 15px;
  &::placeholder {
    color: var(--text-placeholder);
  }
}
.searching-spin {
  width: 18px;
  height: 18px;
  color: var(--brand-blue);
  flex-shrink: 0;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.error-text {
  font-size: 12px;
  color: var(--color-error);
  padding-left: 16px;
}
.agreement-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.checkbox-label {
  position: relative;
  cursor: pointer;
}
.agreement-checkbox {
  opacity: 0;
  position: absolute;
}
.checkmark {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-strong);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  &::after {
    content: "";
    width: 5px;
    height: 9px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
    opacity: 0;
    transition: opacity var(--transition-fast);
  }
}
.agreement-checkbox:checked + .checkmark {
  background: var(--brand-blue);
  border-color: var(--brand-blue);
  &::after {
    opacity: 1;
  }
}
.agreement-text {
  font-size: 13px;
  color: var(--text-tertiary);
  user-select: none;
}
.privacy-link {
  color: var(--brand-blue);
  text-decoration: none;
  font-weight: 500;
  &:active {
    opacity: 0.7;
  }
}
.login-btn {
  width: 100%;
  height: 50px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 4px;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  position: relative;
  overflow: hidden;
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transition: left 0.5s ease;
  }
  &:hover:not(:disabled)::before {
    left: 100%;
  }
}
.loading-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.dot {
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
  animation: dotPulse 1.4s infinite ease-in-out both;
  &:nth-child(1) {
    animation-delay: -0.32s;
  }
  &:nth-child(2) {
    animation-delay: -0.16s;
  }
}
@keyframes dotPulse {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}
.privacy-modal {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 70vh;
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease;
}
@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
.privacy-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 12px;
  border-bottom: 1px solid var(--border-light);
  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
}
.privacy-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-hover);
  border: none;
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;
  svg {
    width: 18px;
    height: 18px;
  }
}
.privacy-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.8;
}
.privacy-footer {
  padding: 12px 20px 28px;
}
.privacy-confirm {
  width: 100%;
  height: 46px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.quick-login-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  .quick-btn {
    margin-top: 4px;
    letter-spacing: 2px;
  }
}
.quick-avatar-row {
  display: flex;
  align-items: center;
  gap: 20px;
}
.switch-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--glass-bg);
  border: 1px solid var(--border-medium);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  transition: all var(--transition-fast);
  svg {
    width: 20px;
    height: 20px;
  }
  &:active {
    color: var(--brand-blue);
    border-color: var(--brand-blue);
    transform: scale(0.94);
  }
}
.avatar-box {
  position: relative;
}
.delete-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 24px;
  height: 24px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  svg {
    width: 12px;
    height: 12px;
  }
  &:active {
    background: #ef4444;
    transform: scale(0.9);
  }
}
.quick-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 20px 0 4px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 22px;
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--border-strong);
    transition: all var(--transition-fast);
    cursor: pointer;
    &.active {
      width: 18px;
      border-radius: 3px;
      background: var(--brand-blue);
    }
  }
}
.switch-link {
  margin-top: 18px;
  font-size: 14px;
  color: var(--brand-blue);
  text-decoration: none;
  cursor: pointer;
  &:active {
    opacity: 0.7;
  }
}
.form-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: -8px;
  .switch-link {
    margin-top: 0;
  }
  .divider {
    color: var(--text-placeholder);
    font-size: 13px;
  }
}
</style>
