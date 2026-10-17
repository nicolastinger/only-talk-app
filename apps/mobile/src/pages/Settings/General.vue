<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  getAutoDownloadOnWifi,
  getAutoDownloadOnCellular,
  setAutoDownloadOnWifi,
  setAutoDownloadOnCellular,
} from "@workspace/services";
import { useTheme, type ChatsFontSize, type ThemeMode } from "@/stores/theme";
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
</style>
