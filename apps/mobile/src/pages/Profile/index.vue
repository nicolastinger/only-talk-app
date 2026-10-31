<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import {
  getDoNotDisturbRange,
  isDoNotDisturbEnabled,
  kv_get,
  kv_remove,
  kv_set,
  setDoNotDisturbEnabled,
  setDoNotDisturbRange,
} from "@workspace/services";
import { useAvatar } from "@/hooks/useAvatar";
import { useUserStore, DEFAULT_AVATAR } from "@/stores/user";
import { useUnreadStore } from "@/stores/unread";
import { usePresenceStore } from "@/stores/presence";
import { useTheme } from "@/stores/theme";
import PresenceTag from "@/components/PresenceTag.vue";
import { getMyAccount } from "@/utils/api";
import { useI18n, type Locale } from "@/i18n";
import type { PresenceMode } from "@workspace/types";

const router = useRouter();
const { t, locale, setLocale } = useI18n();
const { userInfo, loadUserInfo } = useUserStore();
const { getAvatarUrl } = useAvatar();
const { notifyUnread } = useUnreadStore();
const { myPresence, loadMyPresence, updateMyPresence } = usePresenceStore();
const { effectiveTheme, setMode } = useTheme();

const account = ref("");
const avatarUrl = ref<string | null>(null);

// 手动状态(忙碌/离开/学习中/奋斗中/自定义): 与在线离线无关, 48 小时后自动清除
const showStatusSheet = ref(false);
const showCustomDialog = ref(false);
const customText = ref("");

const STATUS_OPTIONS: { nameKey: string; mode: PresenceMode }[] = [
  { nameKey: "onlineStatus.online", mode: "online" },
  { nameKey: "onlineStatus.busy", mode: "busy" },
  { nameKey: "onlineStatus.away", mode: "away" },
  { nameKey: "onlineStatus.studying", mode: "studying" },
  { nameKey: "onlineStatus.working", mode: "working" },
  { nameKey: "onlineStatus.custom", mode: "custom" },
];

const statusActions = computed(() =>
  STATUS_OPTIONS.map((item) => ({ name: t(item.nameKey), value: item.mode }))
);

const activePresence = computed(() => {
  const presence = myPresence.value;
  return presence && presence.mode !== "online" ? presence : null;
});

const openStatusSheet = () => {
  showStatusSheet.value = true;
};

const onSelectStatus = async (action: { value?: string }) => {
  const mode = action.value as PresenceMode;
  showStatusSheet.value = false;
  if (!mode) return;
  if (mode === "custom") {
    customText.value =
      myPresence.value?.mode === "custom" ? myPresence.value.text || "" : "";
    showCustomDialog.value = true;
    return;
  }
  try {
    await updateMyPresence(mode);
  } catch (e) {
    console.error("设置状态失败:", e);
    showToast(t("onlineStatus.setFailed"));
  }
};

const onCustomBeforeClose = async (action: string) => {
  if (action !== "confirm") return true;
  const text = customText.value.trim();
  if (!text) {
    showToast(t("onlineStatus.customEmpty"));
    return false;
  }
  try {
    await updateMyPresence("custom", text);
    return true;
  } catch (e) {
    console.error("设置自定义状态失败:", e);
    showToast(t("onlineStatus.setFailed"));
    return false;
  }
};

const loadAvatar = async (icon: string) => {
  avatarUrl.value = await getAvatarUrl(icon);
};

onMounted(async () => {
  try {
    const acc = await getMyAccount();
    account.value = acc;
  } catch {
    /* ignore */
  }
  await loadUserInfo();
  loadMyPresence();
  dndOn.value = isDoNotDisturbEnabled();
  if (userInfo.value?.icon) {
    loadAvatar(userInfo.value.icon);
  }
});

const getAvatar = () => avatarUrl.value || DEFAULT_AVATAR;

const goToEditProfile = () => {
  router.push("/profile/edit");
};

const goToNotifications = () => {
  router.push("/notifications");
};

const onMenuClick = () => {
  router.push("/settings");
};

const goToFiles = () => {
  router.push("/files");
};

// ===== 顶部快捷操作: 一键免打扰 / 更换主题 / 切换语言 =====

/** 快捷免打扰会把时段改成"全天", 这里记住用户原来的时段, 关闭时还原 */
const DND_RANGE_KEY = "ui_dnd_prev_range";
const dndOn = ref(false);
const dndBusy = ref(false);

const toggleDnd = async () => {
  if (dndBusy.value) return;
  dndBusy.value = true;
  try {
    if (dndOn.value) {
      await setDoNotDisturbEnabled(false);
      const saved = await kv_get(DND_RANGE_KEY);
      const range = getDoNotDisturbRange();
      // 只有当前处于"全天"时段才说明是快捷免打扰改的, 才需要还原
      if (saved && range.start === range.end) {
        try {
          const prev = JSON.parse(saved) as { start?: string; end?: string };
          if (prev.start && prev.end) {
            await setDoNotDisturbRange(prev.start, prev.end);
          }
        } catch {
          // 脏数据忽略
        }
      }
      await kv_remove(DND_RANGE_KEY);
      dndOn.value = false;
      showToast(t("profile.dndOff"));
      return;
    }
    // 记住原时段(已经是全天则不记)
    const range = getDoNotDisturbRange();
    if (range.start !== range.end) {
      await kv_set(DND_RANGE_KEY, JSON.stringify(range));
    }
    // 起止相同 = 全天免打扰(Rust 端与前端使用同一套时段规则)
    await setDoNotDisturbRange("00:00", "00:00");
    await setDoNotDisturbEnabled(true);
    dndOn.value = true;
    showToast(t("profile.dndOn"));
  } catch (e) {
    console.error("切换免打扰失败:", e);
    showToast(t("profile.dndFailed"));
    dndOn.value = isDoNotDisturbEnabled();
  } finally {
    dndBusy.value = false;
  }
};

// 一键在浅色/深色之间切换(system 模式则切到当前生效主题的反面)
const toggleTheme = (event: MouseEvent) => {
  const next = effectiveTheme.value === "dark" ? "light" : "dark";
  setMode(next, { x: event.clientX, y: event.clientY });
};

const LANGUAGE_OPTIONS: { value: Locale; key: string }[] = [
  { value: "zh-CN", key: "settings.generalSettings.languageOptions.zhCN" },
  { value: "zh-TW", key: "settings.generalSettings.languageOptions.zhTW" },
  { value: "en-US", key: "settings.generalSettings.languageOptions.enUS" },
];

// 快捷切换语言: 每次点击按 简体中文 → 繁體中文 → English 循环
const cycleLanguage = () => {
  const index = LANGUAGE_OPTIONS.findIndex(
    (item) => item.value === locale.value
  );
  const next = LANGUAGE_OPTIONS[(index + 1) % LANGUAGE_OPTIONS.length];
  if (!next) return;
  setLocale(next.value);
  // 切换后再取文案, 提示语本身就是新语言
  showToast(t(next.key));
};
</script>

<template>
  <div class="profile-page">
    <div class="header">
      <svg class="title-icon" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      </svg>
      <span class="page-title">{{ t("profile.title") }}</span>
      <div class="header-actions">
        <button
          class="header-action"
          :class="{ active: dndOn }"
          type="button"
          :aria-label="t('profile.quickDoNotDisturb')"
          :title="t('profile.quickDoNotDisturb')"
          @click="toggleDnd"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52 1.02-.8 2.16-.8 3.43v5l-2 2v1h14.03l2 2 1.27-1.27zM12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6.34V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.59.13-1.15.35-1.66.65l10.16 10.16z"
            />
          </svg>
        </button>
        <button
          class="header-action"
          type="button"
          :aria-label="t('profile.quickTheme')"
          :title="t('profile.quickTheme')"
          @click="toggleTheme"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
            />
          </svg>
        </button>
        <button
          class="header-action"
          type="button"
          :aria-label="t('profile.quickLanguage')"
          :title="t('profile.quickLanguage')"
          @click="cycleLanguage"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="user-card">
      <div class="user-bg"></div>
      <div class="user-content" @click="goToEditProfile">
        <div class="avatar-wrapper">
          <img
            :src="getAvatar()"
            alt="avatar"
            class="user-avatar"
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
        </div>
        <div class="user-info">
          <h2 class="user-name">
            {{ userInfo?.username || account || t("common.user") }}
            <UserTypeTag :type="userInfo?.user_type" />
          </h2>
          <p class="user-account">
            {{ t("settings.accountPrivacy.accountLabel") }}:
            {{ userInfo?.account || account }}
          </p>
          <p v-if="userInfo?.info" class="user-bio">{{ userInfo.info }}</p>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div class="status-row" @click="openStatusSheet">
      <div class="status-left">
        <span class="status-label">{{ t("profile.status") }}</span>
        <PresenceTag v-if="activePresence" :presence="activePresence" />
        <span v-else class="status-empty">{{ t("onlineStatus.online") }}</span>
      </div>
      <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
      </svg>
    </div>

    <div class="menu-section">
      <div class="menu-item" @click="goToNotifications">
        <div class="menu-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="menu-icon">
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            />
          </svg>
          <span class="menu-name">{{ t("profile.notifications") }}</span>
        </div>
        <div class="menu-right">
          <span v-if="notifyUnread > 0" class="menu-badge">{{
            notifyUnread > 99 ? "99+" : notifyUnread
          }}</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
        </div>
      </div>

      <div class="menu-item" @click="goToFiles">
        <div class="menu-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="menu-icon">
            <path
              d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"
            />
          </svg>
          <span class="menu-name">{{ t("profile.files") }}</span>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div class="menu-section">
      <div class="menu-item" @click="onMenuClick">
        <div class="menu-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="menu-icon">
            <path
              d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
            />
          </svg>
          <span class="menu-name">{{ t("settings.title") }}</span>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <ActionSheet
      v-model:show="showStatusSheet"
      :actions="statusActions"
      :cancel-text="t('common.cancel')"
      teleport="body"
      @select="onSelectStatus"
    />

    <Dialog
      v-model:show="showCustomDialog"
      :title="t('onlineStatus.customTitle')"
      :confirm-button-text="t('common.confirm')"
      :cancel-button-text="t('common.cancel')"
      show-cancel-button
      :before-close="onCustomBeforeClose"
    >
      <Field
        v-model="customText"
        :placeholder="t('onlineStatus.customPlaceholder')"
        maxlength="32"
        autofocus
      />
      <p class="status-hint">{{ t("onlineStatus.expireHint") }}</p>
    </Dialog>
  </div>
</template>

<style scoped lang="less">
.profile-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

.header {
  padding: max(12px, env(safe-area-inset-top)) 20px 12px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  width: 26px;
  height: 26px;
  color: var(--brand-blue);
  flex-shrink: 0;
  display: block;
}

.page-title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-action {
  width: 34px;
  height: 34px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  background: var(--glass-bg);
  color: var(--brand-blue);
  box-shadow: var(--shadow-xs);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:active {
    background: var(--surface-hover);
    transform: scale(0.94);
  }

  /* 已开启免打扰: 实心高亮, 一眼可辨 */
  &.active {
    background: var(--gradient-primary);
    border-color: transparent;
    color: #fff;
    box-shadow: 0 6px 16px rgba(74, 144, 255, 0.32);
  }
}

.user-card {
  margin: 16px;
  border-radius: var(--radius-xl);
  overflow: hidden;
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-lg);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
}

.user-bg {
  position: absolute;
  inset: 0;
  background: var(--profile-hero-grad);
}

.user-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 20px;
  cursor: pointer;
  &:active {
    background: rgba(74, 144, 255, 0.04);
  }
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 50%;
  background: var(--profile-avatar-ring);
  box-shadow: var(--shadow-sm);
}

.user-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid var(--surface);
  box-shadow: var(--shadow-xs);
  object-fit: cover;
  display: block;
}

.user-info {
  flex: 1;
  min-width: 0;
}
.user-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.user-account {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}
.user-bio {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arrow {
  width: 20px;
  height: 20px;
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 16px 12px;
  padding: 12px 16px;
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition: background 0.2s ease;
}

.status-row:active {
  background: var(--surface-hover, rgba(0, 0, 0, 0.04));
}

.status-left {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-label {
  flex-shrink: 0;
  font-size: 15px;
  color: var(--text-primary);
}

.status-empty {
  font-size: 13px;
  color: var(--text-tertiary);
}

.status-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.menu-section {
  margin: 0 16px 12px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
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

.menu-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.menu-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.menu-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: #fff;
  background: #ef4444;
  border-radius: 999px;
}
.menu-icon {
  width: 22px;
  height: 22px;
  color: var(--brand-blue);
  flex-shrink: 0;
}
.menu-name {
  font-size: 15px;
  color: var(--text-primary);
}
</style>
