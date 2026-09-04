<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { useAvatar } from "@/hooks/useAvatar";
import { useUserStore, DEFAULT_AVATAR } from "@/stores/user";
import { getMyAccount } from "@/utils/api";

interface PrivacyPrefs {
  searchByPhone: boolean;
  recommend: boolean;
}

const STORAGE_KEY = "onlytalk_settings_privacy";

const defaultPrefs = (): PrivacyPrefs => ({
  searchByPhone: true,
  recommend: true,
});

const loadPrefs = (): PrivacyPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultPrefs();
};

const router = useRouter();
const { userInfo, loadUserInfo } = useUserStore();
const { getAvatarUrl } = useAvatar();
const prefs = reactive<PrivacyPrefs>(loadPrefs());
const account = ref("");
const avatarUrl = ref<string | null>(null);

watch(prefs, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)));

const genderLabel = (gender?: number) => {
  if (gender === 2) return "男";
  if (gender === 3) return "女";
  if (gender === 1) return "保密";
  if (gender === 4) return "机器人";
  if (gender === 5) return "其他";
  return "-";
};

const formatBirthday = (timestamp?: number) => {
  if (!timestamp) return "-";
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

onMounted(async () => {
  account.value = await getMyAccount().catch(() => "");
  await loadUserInfo();
  if (userInfo.value?.icon) {
    avatarUrl.value = await getAvatarUrl(userInfo.value.icon);
  }
});

const goBack = () => router.back();

const goEditProfile = () => router.push("/profile/edit");

const goBlacklist = () => router.push("/settings/blacklist");

const onChangePassword = () => {
  showToast({ message: "暂不支持修改密码", icon: "none" });
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="账号与隐私" left-arrow @click-left="goBack" />

    <div class="user-card">
      <div class="user-content">
        <img
          :src="avatarUrl || DEFAULT_AVATAR"
          alt="avatar"
          class="user-avatar"
          @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
        />
        <div class="user-info">
          <div class="user-name">{{ userInfo?.username || account || "用户" }}</div>
          <div class="user-account">账号：{{ userInfo?.account || account || "-" }}</div>
        </div>
      </div>
      <div class="account-info">
        <span class="account-label">手机号</span>
        <span class="account-value">
          {{
            userInfo?.phone
              ? `${userInfo.phone.slice(0, 3)}****${userInfo.phone.slice(-4)}`
              : "-"
          }}
        </span>
      </div>
      <div class="account-info">
        <span class="account-label">邮箱</span>
        <span class="account-value">{{ userInfo?.email || "-" }}</span>
      </div>
      <div class="account-info">
        <span class="account-label">性别</span>
        <span class="account-value">{{ genderLabel(userInfo?.gender) }}</span>
      </div>
      <div class="account-info">
        <span class="account-label">年龄</span>
        <span class="account-value">{{ userInfo?.age ?? "-" }}</span>
      </div>
      <div class="account-info">
        <span class="account-label">生日</span>
        <span class="account-value">{{ formatBirthday(userInfo?.birthday) }}</span>
      </div>
      <div class="account-info">
        <span class="account-label">个人简介</span>
        <span class="account-value">{{ userInfo?.info || "-" }}</span>
      </div>
    </div>

    <div class="section-card">
      <div class="link-row" @click="goEditProfile">
        <span class="link-name">编辑资料</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
      <div class="link-row" @click="goBlacklist">
        <span class="link-name">黑名单管理</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
      <div class="link-row" @click="onChangePassword">
        <span class="link-name">修改密码</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">隐私设置</div>
      <div class="pref-row">
        <span class="pref-name">允许通过手机号找到我</span>
        <van-switch v-model="prefs.searchByPhone" size="22px" />
      </div>
      <div class="pref-row">
        <span class="pref-name">允许被推荐给可能认识的人</span>
        <van-switch v-model="prefs.recommend" size="22px" />
      </div>
    </div>

    <p class="page-tip">隐私开关设置仅保存在本机。</p>
  </div>
</template>

<style scoped lang="less">
.settings-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.user-card {
  margin: 16px 16px 0;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-xs);
}

.user-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--divider-bg, var(--border-light));
}

.user-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid var(--border-strong);
  object-fit: cover;
  flex-shrink: 0;
}

.user-info {
  min-width: 0;
}

.user-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.user-account {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.account-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 20px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);

  &:last-of-type {
    border-bottom: none;
  }
}

.account-label {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.account-value {
  text-align: right;
  min-width: 0;
  word-break: break-all;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.section-card {
  margin: 16px 16px 0;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.section-title {
  padding: 14px 16px 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--transition-fast);

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: var(--surface-hover);
  }
}

.link-name {
  font-size: 15px;
  color: var(--text-primary);
}

.arrow {
  width: 18px;
  height: 18px;
  color: var(--text-placeholder);
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.pref-name {
  font-size: 15px;
  color: var(--text-primary);
}

.page-tip {
  margin: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
