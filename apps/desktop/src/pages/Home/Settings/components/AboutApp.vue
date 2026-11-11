<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  FileTextOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';
import type { UpdateDownloadProgress } from '@workspace/services';
import {
  buildAppVersion,
  checkForUpdate,
  downloadUpdatePackage,
  formatFileSize,
  getAppVersion,
  installUpdate,
  openExternalUrl,
} from '@workspace/services';
import {
  PRIVACY_POLICY_URL,
  USER_AGREEMENT_URL,
  type UpdateInfo,
} from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../Settings.module.less';

const { t } = useI18n();

// 先展示构建期版本(与 tauri.conf.json 同源), 挂载后再用 Tauri 运行时版本校正
const version = ref(buildAppVersion);
const checking = ref(false);
const downloading = ref(false);
const installing = ref(false);
const progress = ref<UpdateDownloadProgress>({
  fileName: '',
  downloaded: 0,
  total: 0,
});
const localPath = ref<string | null>(null);
const updateInfo = ref<UpdateInfo | null>(null);
const modalOpen = ref(false);

onMounted(() => {
  // 运行时读取 Tauri 应用版本(无 Tauri 运行时自动回退到构建期注入的版本)
  void getAppVersion().then((value) => {
    version.value = value;
  });
});

const onCheckUpdate = async () => {
  checking.value = true;
  try {
    const result = await checkForUpdate();
    if (!result.hasUpdate || !result.info) {
      feedback.message.success(t('settings.aboutApp.latestVersion'));
      return;
    }
    updateInfo.value = result.info;
    localPath.value = null;
    modalOpen.value = true;
  } catch (e) {
    console.error('检查更新失败:', e);
    feedback.message.error(t('settings.aboutApp.checkFailed'));
  } finally {
    checking.value = false;
  }
};

const onDownload = async () => {
  if (!updateInfo.value) return;
  downloading.value = true;
  progress.value = {
    fileName: updateInfo.value.file_name,
    downloaded: 0,
    total: 0,
  };
  try {
    const path = await downloadUpdatePackage(updateInfo.value, (value) => {
      progress.value = value;
    });
    localPath.value = path;
    feedback.message.success(t('settings.aboutApp.downloadComplete'));
  } catch (e) {
    console.error('下载更新失败:', e);
    feedback.message.error(t('settings.aboutApp.downloadFailed'));
  } finally {
    downloading.value = false;
  }
};

const onInstall = async () => {
  if (!localPath.value) return;
  installing.value = true;
  try {
    // Windows 端 install_update 会静默安装并退出进程; Android 端调起系统安装器
    await installUpdate(localPath.value);
    modalOpen.value = false;
  } catch (e) {
    console.error('安装更新失败:', e);
    feedback.message.error(t('settings.aboutApp.installFailed'));
  } finally {
    installing.value = false;
  }
};

/** 打开官网法务页面(用户协议 / 隐私协议) */
const openExternal = (url: string) => {
  openExternalUrl(url).catch((e) => console.error('打开链接失败:', url, e));
};

const forceUpdate = computed(() => !!updateInfo.value?.force_update);
const downloadPercent = computed(() =>
  progress.value.total > 0
    ? Math.min(
        100,
        Math.floor((progress.value.downloaded / progress.value.total) * 100),
      )
    : 0,
);

const okText = computed(() => {
  if (downloading.value) return t('settings.aboutApp.downloading');
  if (installing.value) return t('settings.aboutApp.installing');
  if (localPath.value) return t('settings.aboutApp.installNow');
  return t('settings.aboutApp.downloadNow');
});

const onModalOk = () => {
  if (localPath.value) {
    onInstall();
  } else {
    onDownload();
  }
};

const onModalCancel = () => {
  if (!forceUpdate.value) modalOpen.value = false;
};
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.aboutApp.title') }}
    </a-typography-title>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <InfoCircleOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.aboutApp.appInfo') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <div :class="styles.appInfo">
        <a-typography-text type="secondary">
          {{ t('settings.aboutApp.appName') }}
        </a-typography-text>
        <a-typography-text>Only Talk</a-typography-text>
      </div>
      <div :class="styles.appInfo">
        <a-typography-text type="secondary">
          {{ t('settings.aboutApp.version') }}
        </a-typography-text>
        <a-typography-text>v{{ version }}</a-typography-text>
      </div>
      <div :class="styles.appInfo">
        <a-typography-text type="secondary">
          {{ t('settings.aboutApp.developer') }}
        </a-typography-text>
        <a-typography-text>UMI Team</a-typography-text>
      </div>
      <div :class="styles.appInfo">
        <a-typography-text type="secondary">
          {{ t('settings.aboutApp.copyright') }}
        </a-typography-text>
        <a-typography-text>
          © 2023 Only Talk. All rights reserved.
        </a-typography-text>
      </div>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <SyncOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.aboutApp.checkUpdate') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-button type="primary" :loading="checking" @click="onCheckUpdate">
        <template #icon><SyncOutlined /></template>
        {{ t('settings.aboutApp.checkNewVersion') }}
      </a-button>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <QuestionCircleOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.aboutApp.feedbackHelp') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <div :class="styles.buttonGroup">
        <a-button>
          <template #icon><MessageOutlined /></template>
          {{ t('settings.aboutApp.feedback') }}
        </a-button>
        <a-button style="margin-left: 10px">
          <template #icon><QuestionCircleOutlined /></template>
          {{ t('settings.aboutApp.helpDoc') }}
        </a-button>
      </div>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <FileTextOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.aboutApp.legal') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <div :class="styles.buttonGroup">
        <a-button @click="openExternal(USER_AGREEMENT_URL)">
          {{ t('settings.aboutApp.userAgreement') }}
        </a-button>
        <a-button
          style="margin-left: 10px"
          @click="openExternal(PRIVACY_POLICY_URL)"
        >
          {{ t('settings.aboutApp.privacyPolicy') }}
        </a-button>
      </div>
    </a-card>

    <a-modal
      :title="
        t('settings.aboutApp.newVersionAvailable', {
          version: updateInfo?.version ?? '',
        })
      "
      :open="modalOpen"
      :ok-text="okText"
      :cancel-text="t('settings.aboutApp.later')"
      :cancel-button-props="{
        disabled: forceUpdate || downloading || installing,
      }"
      :ok-button-props="{ loading: downloading || installing }"
      :closable="!forceUpdate"
      :mask-closable="!forceUpdate"
      :keyboard="!forceUpdate"
      :width="480"
      centered
      @ok="onModalOk"
      @cancel="onModalCancel"
    >
      <a-alert
        v-if="forceUpdate"
        type="warning"
        show-icon
        style="margin-bottom: 12px"
        :message="t('settings.aboutApp.forceUpdate')"
      />
      <div :class="styles.appInfo">
        <a-typography-text type="secondary">
          {{ t('settings.aboutApp.version') }}
        </a-typography-text>
        <a-typography-text strong>
          v{{ updateInfo?.version }}
        </a-typography-text>
      </div>
      <div :class="styles.appInfo">
        <a-typography-text type="secondary">
          {{ t('settings.aboutApp.releaseSize') }}
        </a-typography-text>
        <a-typography-text>
          {{ formatFileSize(updateInfo?.size || 0) }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-typography-text strong>
        {{ t('settings.aboutApp.releaseNotes') }}
      </a-typography-text>
      <a-typography-paragraph
        style="
          margin-top: 8px;
          max-height: 240px;
          overflow: auto;
          white-space: pre-wrap;
        "
      >
        {{ updateInfo?.notes || '-' }}
      </a-typography-paragraph>
      <div v-if="downloading" style="margin-top: 12px">
        <a-progress
          :percent="progress.total > 0 ? downloadPercent : 100"
          status="active"
          :show-info="progress.total > 0"
        />
        <a-typography-text
          v-if="progress.total > 0"
          type="secondary"
          style="font-size: 12px"
        >
          {{ formatFileSize(progress.downloaded) }} /
          {{ formatFileSize(progress.total) }}
        </a-typography-text>
      </div>
      <a-alert
        v-if="localPath && !downloading"
        type="success"
        show-icon
        style="margin-top: 12px"
        :message="t('settings.aboutApp.downloadComplete')"
      />
    </a-modal>
  </div>
</template>
