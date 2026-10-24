<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { showConfirmDialog, showToast } from "vant";
import {
  deleteChatBackground,
  getAutoDownloadOnWifi,
  getAutoDownloadOnCellular,
  importChatBackground,
  pickChatBackgroundImage,
  resolveChatBackgroundUrl,
  setActiveChatBackground,
  setAutoDownloadOnWifi,
  setAutoDownloadOnCellular,
  type ChatBackgroundVo,
} from "@workspace/services";
import { useTheme, type ChatsFontSize, type ThemeMode } from "@/stores/theme";
import { useChatBackgroundStore } from "@/stores/chatBackground";
import { useI18n, type Locale } from "@/i18n";

const router = useRouter();
const { t, locale, setLocale } = useI18n();
const { mode, fontSize, setMode, setFontSize } = useTheme();

const autoDownload = ref(true);
getAutoDownloadOnWifi()
  .then((value) => {
    autoDownload.value = value;
  })
  .catch(() => {});

const setAutoDownload = (value: boolean) => {
  autoDownload.value = value;
  setAutoDownloadOnWifi(value).catch(() => {});
};

const autoDownloadCellular = ref(true);
getAutoDownloadOnCellular()
  .then((value) => {
    autoDownloadCellular.value = value;
  })
  .catch(() => {});

const setAutoDownloadCellular = (value: boolean) => {
  autoDownloadCellular.value = value;
  setAutoDownloadOnCellular(value).catch(() => {});
};

const themeOptions: { value: ThemeMode; key: string }[] = [
  { value: "light", key: "settings.generalSettings.themeModes.light" },
  { value: "dark", key: "settings.generalSettings.themeModes.dark" },
  { value: "system", key: "settings.generalSettings.themeModes.system" },
];

const languageOptions: { value: Locale; key: string }[] = [
  { value: "zh-CN", key: "settings.generalSettings.languageOptions.zhCN" },
  { value: "zh-TW", key: "settings.generalSettings.languageOptions.zhTW" },
  { value: "en-US", key: "settings.generalSettings.languageOptions.enUS" },
];

const fontOptions: { value: ChatsFontSize; key: string }[] = [
  { value: "small", key: "settings.generalSettings.fontSizes.small" },
  { value: "medium", key: "settings.generalSettings.fontSizes.medium" },
  { value: "large", key: "settings.generalSettings.fontSizes.large" },
];

const goBack = () => router.back();

// 聊天背景(仅客户端): 历史列表 + 当前生效项
const {
  backgrounds,
  activeUrl,
  refresh: refreshChatBackground,
} = useChatBackgroundStore();
const backgroundUploading = ref(false);

const backgroundThumb = (item: ChatBackgroundVo) =>
  resolveChatBackgroundUrl(item.file_path);

const handleBackgroundUpload = async () => {
  const path = await pickChatBackgroundImage();
  if (!path) return;
  backgroundUploading.value = true;
  try {
    await importChatBackground(path);
    await refreshChatBackground();
    showToast({
      message: t("settings.generalSettings.chatBackgroundApplied"),
    });
  } catch (e) {
    console.error("设置聊天背景失败:", e);
    showToast({
      message: t("settings.generalSettings.chatBackgroundApplyFailed"),
      icon: "fail",
    });
  } finally {
    backgroundUploading.value = false;
  }
};

const handleBackgroundSelect = async (id: number) => {
  try {
    await setActiveChatBackground(id);
    await refreshChatBackground();
  } catch (e) {
    console.error("切换聊天背景失败:", e);
    showToast({
      message: t("settings.generalSettings.chatBackgroundApplyFailed"),
      icon: "fail",
    });
  }
};

const handleBackgroundReset = async () => {
  try {
    await setActiveChatBackground(null);
    await refreshChatBackground();
  } catch (e) {
    console.error("恢复默认聊天背景失败:", e);
    showToast({
      message: t("settings.generalSettings.chatBackgroundApplyFailed"),
      icon: "fail",
    });
  }
};

const handleBackgroundDelete = async (id: number) => {
  try {
    await showConfirmDialog({
      title: t("settings.generalSettings.chatBackgroundDeleteConfirm"),
    });
  } catch {
    // 取消删除
    return;
  }
  try {
    await deleteChatBackground(id);
    await refreshChatBackground();
  } catch (e) {
    console.error("删除聊天背景失败:", e);
    showToast({
      message: t("settings.generalSettings.chatBackgroundApplyFailed"),
      icon: "fail",
    });
  }
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar
      :title="t('settings.generalSettings.title')"
      left-arrow
      @click-left="goBack"
    />

    <div class="section-card">
      <div class="section-title">{{ t("settings.generalSettings.theme") }}</div>
      <p class="desc">{{ t("settings.generalSettings.themeDesc") }}</p>
      <div class="option-group">
        <button
          v-for="item in themeOptions"
          :key="item.value"
          class="option"
          :class="{ active: mode === item.value }"
          @click="setMode(item.value, { x: $event.clientX, y: $event.clientY })"
        >
          {{ t(item.key) }}
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">
        {{ t("settings.generalSettings.language") }}
      </div>
      <p class="desc">{{ t("settings.generalSettings.languageDesc") }}</p>
      <div class="option-group">
        <button
          v-for="item in languageOptions"
          :key="item.value"
          class="option"
          :class="{ active: locale === item.value }"
          @click="setLocale(item.value)"
        >
          {{ t(item.key) }}
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">
        {{ t("settings.generalSettings.fontSize") }}
      </div>
      <p class="desc">{{ t("settings.generalSettings.fontSizeDesc") }}</p>
      <div class="option-group">
        <button
          v-for="item in fontOptions"
          :key="item.value"
          class="option"
          :class="{ active: fontSize === item.value }"
          @click="setFontSize(item.value)"
        >
          {{ t(item.key) }}
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">
        {{ t("settings.generalSettings.chatBackground") }}
      </div>
      <p class="desc">
        {{ t("settings.generalSettings.chatBackgroundDesc") }}
      </p>

      <!-- 预览: 背景图 + 蒙层 + 假气泡, 直观看到实际聊天时的可读性 -->
      <div class="bg-hero" :class="{ blank: !activeUrl }">
        <template v-if="activeUrl">
          <img class="bg-hero-img" :src="activeUrl" alt="" />
          <span class="bg-hero-scrim"></span>
          <span class="bg-hero-chip">
            {{ t("settings.generalSettings.chatBackgroundInUse") }}
          </span>
          <span class="bg-bubbles">
            <span class="bg-bubble in"></span>
            <span class="bg-bubble out"></span>
            <span class="bg-bubble in short"></span>
          </span>
        </template>
        <div v-else class="bg-hero-empty">
          <svg class="bg-hero-icon" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
            />
          </svg>
          <span class="bg-hero-empty-text">
            {{ t("settings.generalSettings.chatBackgroundEmpty") }}
          </span>
        </div>
      </div>

      <div class="bg-actions">
        <button
          class="bg-btn primary"
          :disabled="backgroundUploading"
          @click="handleBackgroundUpload"
        >
          {{
            backgroundUploading
              ? t("settings.generalSettings.chatBackgroundUploading")
              : t("settings.generalSettings.chatBackgroundUpload")
          }}
        </button>
        <button
          v-if="activeUrl"
          class="bg-btn ghost"
          @click="handleBackgroundReset"
        >
          {{ t("settings.generalSettings.chatBackgroundReset") }}
        </button>
      </div>

      <template v-if="backgrounds.length">
        <div class="bg-strip-label">
          {{ t("settings.generalSettings.chatBackgroundHistory") }}
        </div>
        <div class="bg-grid">
          <div
            v-for="item in backgrounds"
            :key="item.id"
            class="bg-item"
            :class="{ active: item.is_active }"
            @click="handleBackgroundSelect(item.id)"
          >
            <img :src="backgroundThumb(item)" alt="" />
            <span v-if="item.is_active" class="bg-check">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </span>
            <span
              class="bg-del"
              role="button"
              :aria-label="t('common.delete')"
              @click.stop="handleBackgroundDelete(item.id)"
              >×</span
            >
          </div>
        </div>
      </template>
    </div>

    <div class="section-card">
      <div class="switch-row">
        <div class="switch-text">
          <span class="section-title inline">
            {{ t("settings.generalSettings.autoDownload") }}
          </span>
          <p class="desc inline">
            {{ t("settings.generalSettings.autoDownloadWifi") }}
          </p>
        </div>
        <van-switch
          :model-value="autoDownload"
          size="22px"
          @update:model-value="setAutoDownload"
        />
      </div>
    </div>

    <div class="section-card">
      <div class="switch-row">
        <div class="switch-text">
          <span class="section-title inline">
            {{ t("settings.generalSettings.autoDownloadCellular") }}
          </span>
          <p class="desc inline">
            {{ t("settings.generalSettings.autoDownloadCellularDesc") }}
          </p>
        </div>
        <van-switch
          :model-value="autoDownloadCellular"
          size="22px"
          @update:model-value="setAutoDownloadCellular"
        />
      </div>
    </div>
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

.section-card {
  margin: 16px;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.section-title {
  display: block;
  margin-bottom: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);

  &.inline {
    margin-bottom: 0;
    font-size: 15px;
  }
}

.desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-tertiary);

  &.inline {
    margin: 4px 0 0;
    font-size: 12px;
  }
}

.option-group {
  display: flex;
  gap: 8px;
}

.option {
  flex: 1;
  min-height: 40px;
  padding: 0 8px;
  background: var(--surface-alt);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: rgba(64, 150, 255, 0.1);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.switch-text {
  min-width: 0;
}

// ============ 聊天背景 ============
// 预览: 背景图 + 蒙层 + 假气泡, 直观看到实际聊天时的可读性
.bg-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-bottom: 12px;
  overflow: hidden;
  background: rgba(127, 127, 127, 8%);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);

  &.blank {
    background: rgba(127, 127, 127, 5%);
    border-color: var(--border-medium);
    border-style: dashed;
  }
}

.bg-hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 12%) 0%,
    rgba(0, 0, 0, 0%) 35%,
    rgba(0, 0, 0, 45%) 100%
  );
}

.bg-hero-chip {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 38%);
  border: 1px solid rgba(255, 255, 255, 22%);
  border-radius: 999px;
  backdrop-filter: blur(6px);
}

.bg-bubbles {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  justify-content: center;
  padding: 0 16%;
  pointer-events: none;
}

.bg-bubble {
  height: 20px;
  background: rgba(255, 255, 255, 62%);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 10%);

  &.in {
    width: 60%;
  }

  &.out {
    width: 44%;
    margin-left: auto;
    background: rgba(64, 150, 255, 72%);
  }

  &.short {
    width: 34%;
  }
}

.bg-hero-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 16px;
}

.bg-hero-icon {
  width: 30px;
  height: 30px;
  color: var(--text-tertiary);
}

.bg-hero-empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.bg-actions {
  display: flex;
  gap: 8px;
}

.bg-btn {
  flex: 1;
  height: 44px;
  padding: 0 12px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--surface-alt);
  border: 1px solid var(--border-medium);
  border-radius: 12px;
  transition: all var(--transition-fast);

  &.primary {
    font-weight: 600;
    color: #fff;
    background: var(--color-primary);
    border-color: transparent;
    box-shadow: 0 6px 16px rgba(64, 150, 255, 28%);
  }

  &.ghost {
    flex: 0 0 auto;
    padding: 0 16px;
    color: var(--text-secondary);
    background: transparent;
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.6;
  }
}

.bg-strip-label {
  margin: 16px 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.bg-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.bg-item {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  cursor: pointer;
  background: rgba(127, 127, 127, 8%);
  border: 2px solid transparent;
  border-radius: 12px;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);

  &.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(64, 150, 255, 18%);
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.bg-check {
  position: absolute;
  right: 5px;
  bottom: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: #fff;
  background: var(--color-primary);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 25%);

  svg {
    width: 12px;
    height: 12px;
  }
}

.bg-del {
  position: absolute;
  top: 5px;
  right: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 14px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 45%);
  border-radius: 50%;
  backdrop-filter: blur(4px);
}
</style>
