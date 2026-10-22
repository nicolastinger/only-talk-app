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
          class="bg-btn"
          @click="handleBackgroundReset"
        >
          {{ t("settings.generalSettings.chatBackgroundReset") }}
        </button>
      </div>
      <div v-if="backgrounds.length" class="bg-grid">
        <div
          v-for="item in backgrounds"
          :key="item.id"
          class="bg-item"
          :class="{ active: item.is_active }"
          @click="handleBackgroundSelect(item.id)"
        >
          <img :src="backgroundThumb(item)" alt="" />
          <span
            class="bg-del"
            role="button"
            :aria-label="t('common.delete')"
            @click.stop="handleBackgroundDelete(item.id)"
            >×</span
          >
        </div>
      </div>
      <p v-else class="bg-empty">
        {{ t("settings.generalSettings.chatBackgroundEmpty") }}
      </p>
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

.bg-actions {
  display: flex;
  gap: 8px;
}

.bg-btn {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  background: var(--surface-alt);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &.primary {
    background: rgba(64, 150, 255, 0.12);
    border-color: var(--color-primary);
    color: var(--color-primary);
    font-weight: 500;
  }

  &:disabled {
    opacity: 0.6;
  }
}

.bg-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 12px;
}

.bg-item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface-alt);
  cursor: pointer;

  &.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(64, 150, 255, 20%);
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.bg-del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 45%);
  color: #fff;
  font-size: 14px;
  line-height: 19px;
  text-align: center;
}

.bg-empty {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>
