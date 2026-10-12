<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { showDialog, showToast } from "vant";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  checkForUpdate,
  downloadUpdatePackage,
  formatFileSize,
  installUpdate,
} from "@workspace/services";
import { PRIVACY_POLICY_URL, USER_AGREEMENT_URL } from "@workspace/types";
import type { UpdateInfo } from "@workspace/types";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();
const version = ref("1.0.0");
const checking = ref(false);
const downloading = ref(false);
const installing = ref(false);
const localPath = ref<string | null>(null);
const progressPercent = ref(0);
const progressTotal = ref(0);
const updateInfo = ref<UpdateInfo | null>(null);

onMounted(async () => {
  try {
    version.value = await getVersion();
  } catch {
    // 浏览器环境中无 Tauri 运行时，展示静态版本号
  }
});

const goBack = () => router.back();

const infoRows = computed(() => [
  { name: t("settings.aboutApp.appName"), value: "Only Talk" },
  { name: t("settings.aboutApp.currentVersion"), value: version.value },
]);

const onCheckUpdate = async () => {
  if (checking.value || downloading.value || installing.value) return;
  checking.value = true;
  try {
    const result = await checkForUpdate();
    if (!result.hasUpdate || !result.info) {
      showToast({
        message: t("settings.aboutApp.latestVersion"),
        icon: "success",
      });
      return;
    }
    updateInfo.value = result.info;
    localPath.value = null;
    const info = result.info;
    const sizeText = formatFileSize(info.size);
    await showDialog({
      title: t("settings.aboutApp.newVersionAvailable", {
        version: info.version,
      }),
      message: `${t("settings.aboutApp.updateSize", {
        size: sizeText || "-",
      })}\n\n${info.notes || "-"}`,
      showCancelButton: !info.force_update,
      confirmButtonText: t("settings.aboutApp.downloadNow"),
      cancelButtonText: t("settings.aboutApp.later"),
      closeOnClickOverlay: !info.force_update,
      closeOnPopstate: !info.force_update,
    });
    await onDownload();
  } catch {
    showToast({ message: t("settings.aboutApp.checkFailed"), icon: "fail" });
  } finally {
    checking.value = false;
  }
};

const onDownload = async () => {
  const info = updateInfo.value;
  if (!info || downloading.value) return;
  downloading.value = true;
  progressPercent.value = 0;
  progressTotal.value = 0;
  const toast = showToast({
    type: "loading",
    message: t("settings.aboutApp.downloadingPackage"),
    duration: 0,
    forbidClick: true,
  });
  try {
    const path = await downloadUpdatePackage(info, (p) => {
      progressTotal.value = p.total;
      progressPercent.value =
        p.total > 0
          ? Math.min(100, Math.floor((p.downloaded / p.total) * 100))
          : 0;
    });
    toast.close();
    localPath.value = path;
    showToast({
      message: t("settings.aboutApp.downloadDone"),
      icon: "success",
    });
    await askInstall();
  } catch (e) {
    console.error("下载更新失败:", e);
    toast.close();
    showToast({ message: t("settings.aboutApp.downloadFailed"), icon: "fail" });
  } finally {
    downloading.value = false;
  }
};

/** 下载完成后询问是否立即安装(强制更新时不可取消) */
const askInstall = async () => {
  const force = !!updateInfo.value?.force_update;
  try {
    await showDialog({
      title: t("settings.aboutApp.downloadDone"),
      message: t("settings.aboutApp.installPrompt"),
      showCancelButton: !force,
      confirmButtonText: t("settings.aboutApp.installNow"),
      cancelButtonText: t("settings.aboutApp.laterShort"),
      closeOnClickOverlay: !force,
      closeOnPopstate: !force,
    });
  } catch {
    return;
  }
  await onInstall();
};

const onInstall = async () => {
  if (!localPath.value || installing.value) return;
  installing.value = true;
  try {
    // Android 端调起系统安装器(用户确认安装)
    await installUpdate(localPath.value);
  } catch (e) {
    console.error("安装更新失败:", e);
    showToast({ message: t("settings.aboutApp.installFailed"), icon: "fail" });
  } finally {
    installing.value = false;
  }
};

const onComingSoon = (row: string) => {
  showToast({
    message: t("settings.aboutApp.comingSoonFeature", { feature: row }),
    icon: "none",
  });
};

/** 打开官网法务页面(用户协议 / 隐私协议) */
const openExternal = async (url: string) => {
  try {
    await openUrl(url);
  } catch (e) {
    console.error("打开链接失败:", url, e);
    showToast({ message: t("common.operationFailed"), icon: "fail" });
  }
};
const onOpenUserAgreement = () => void openExternal(USER_AGREEMENT_URL);
const onOpenPrivacy = () => void openExternal(PRIVACY_POLICY_URL);
</script>

<template>
  <div class="settings-page">
    <van-nav-bar
      :title="t('settings.menu.about.name')"
      left-arrow
      @click-left="goBack"
    />

    <div class="about-header">
      <div class="logo">
        <img src="/images/app-icon.png" alt="Only Talk" class="logo-img" />
      </div>
      <div class="app-name">Only Talk</div>
      <div class="app-slogan">{{ t("settings.aboutApp.slogan") }}</div>
      <div class="app-version">Version {{ version }}</div>
    </div>

    <div class="info-card">
      <div class="info-row" v-for="row in infoRows" :key="row.name">
        <span class="info-name">{{ row.name }}</span>
        <span class="info-value">{{ row.value }}</span>
      </div>
    </div>

    <div class="download-progress" v-if="downloading">
      <van-progress
        :percentage="progressTotal > 0 ? progressPercent : 0"
        :show-pivot="progressTotal > 0"
        :pivot-text="progressPercent + '%'"
        stroke-width="6"
        color="var(--brand-blue)"
      />
    </div>

    <div class="menu-card">
      <div
        class="menu-item"
        :class="{ disabled: checking || downloading || installing }"
        @click="onCheckUpdate"
      >
        <span class="menu-name">{{
          checking
            ? t("settings.aboutApp.checking")
            : t("settings.aboutApp.checkUpdate")
        }}</span>
        <span
          class="menu-update-status"
          v-if="checking || downloading || installing"
        >
          {{
            installing
              ? t("settings.aboutApp.installing")
              : downloading
              ? t("settings.aboutApp.downloading")
              : ""
          }}
        </span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
      <div class="menu-item" @click="onOpenUserAgreement">
        <span class="menu-name">{{
          t("settings.aboutApp.userAgreement")
        }}</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
      <div class="menu-item" @click="onOpenPrivacy">
        <span class="menu-name">{{
          t("settings.aboutApp.privacyPolicy")
        }}</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
      <div
        class="menu-item"
        @click="onComingSoon(t('settings.aboutApp.openSourceLicenses'))"
      >
        <span class="menu-name">{{
          t("settings.aboutApp.openSourceLicenses")
        }}</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <p class="copyright">© 2026 Only Talk. All rights reserved.</p>
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

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 0 24px;
}

.logo {
  width: 76px;
  height: 76px;
  border-radius: var(--radius-lg);
  background: var(--gradient-primary);
  overflow: hidden;
  box-shadow: var(--shadow-glow-sm);

  .logo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.app-name {
  margin-top: 14px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.app-slogan {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.app-version {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-placeholder);
}

.info-card,
.menu-card {
  margin: 0 16px 16px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.download-progress {
  margin: 0 16px 16px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.info-name {
  font-size: 15px;
  color: var(--text-secondary);
}

.info-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--transition-fast);

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: var(--surface-hover);
  }
}

.menu-update-status {
  font-size: 13px;
  color: var(--brand-blue);
}

.menu-name {
  font-size: 15px;
  color: var(--text-primary);
}

.arrow {
  width: 18px;
  height: 18px;
  color: var(--text-placeholder);
}

.copyright {
  margin: 20px 16px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
