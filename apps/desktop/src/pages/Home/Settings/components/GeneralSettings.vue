<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  CheckCircleFilled,
  CodeOutlined,
  DownloadOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  PictureOutlined,
  PoweroffOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import {
  deleteChatBackground,
  getAutoDownloadOnWifi,
  importChatBackground,
  listChatBackgrounds,
  pickChatBackgroundImage,
  resolveChatBackgroundUrl,
  setActiveChatBackground,
  setAutoDownloadOnWifi,
  type ChatBackgroundVo,
} from '@workspace/services';
import { useTheme } from '@/hooks/useTheme';
import { useDevAssistantStore } from '@/stores/devAssistant';
import type { ChatsFontSize, ThemeMode } from '@/stores/theme';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../Settings.module.less';

const { t, locale, setLocale } = useI18n();
const { mode, fontSize, setMode, setFontSize } = useTheme();
const devAssistant = useDevAssistantStore();

const autoStartEnabled = ref(false);
const autoStartLoading = ref(false);
const autoDownloadWifi = ref(true);
// 聊天背景(仅客户端): 历史记录 + 当前生效项
const backgrounds = ref<ChatBackgroundVo[]>([]);
const backgroundUploading = ref(false);

onMounted(() => {
  // 读取当前系统注册的开机自启状态，默认不启用
  isEnabled()
    .then((value) => {
      autoStartEnabled.value = value;
    })
    .catch((e) => {
      console.log('获取开机自启状态失败', e);
      autoStartEnabled.value = false;
    });

  // 读取「WiFi 下自动下载图片和视频」开关，默认开启
  getAutoDownloadOnWifi()
    .then((value) => {
      autoDownloadWifi.value = value;
    })
    .catch(() => {});

  refreshBackgrounds();
});

const handleAutoDownloadChange = (checked: boolean) => {
  autoDownloadWifi.value = checked;
  setAutoDownloadOnWifi(checked).catch(() => {});
};

const handleDevAssistantChange = (checked: boolean) => {
  devAssistant.setVisible(checked);
};

const onAutoDownloadChange = (e: { target: { checked: boolean } }) => {
  handleAutoDownloadChange(e.target.checked);
};

const onThemeChange = (value: ThemeMode) => {
  setMode(value);
};

const onFontSizeChange = (value: ChatsFontSize) => {
  setFontSize(value);
};

const handleAutoStartChange = async (checked: boolean) => {
  autoStartLoading.value = true;
  try {
    if (checked) {
      await enable();
    } else {
      await disable();
    }
    autoStartEnabled.value = checked;
  } catch (e) {
    console.log('修改开机自启设置失败', e);
    feedback.message.error(t('settings.generalSettings.autoStartFailed'));
  } finally {
    autoStartLoading.value = false;
  }
};

const handleLanguageChange = (value: string) => {
  setLocale(value as 'zh-CN' | 'zh-TW' | 'en-US');
};

const refreshBackgrounds = () => {
  listChatBackgrounds()
    .then((list) => {
      backgrounds.value = list;
    })
    .catch(() => {});
};

const handleBackgroundUpload = async () => {
  const path = await pickChatBackgroundImage();
  if (!path) return;
  backgroundUploading.value = true;
  try {
    await importChatBackground(path);
    refreshBackgrounds();
    feedback.message.success(
      t('settings.generalSettings.chatBackgroundApplied'),
    );
  } catch (e) {
    console.log('设置聊天背景失败', e);
    feedback.message.error(
      t('settings.generalSettings.chatBackgroundApplyFailed'),
    );
  } finally {
    backgroundUploading.value = false;
  }
};

const handleBackgroundSelect = async (id: number) => {
  try {
    await setActiveChatBackground(id);
    refreshBackgrounds();
  } catch (e) {
    console.log('切换聊天背景失败', e);
    feedback.message.error(
      t('settings.generalSettings.chatBackgroundApplyFailed'),
    );
  }
};

const handleBackgroundReset = async () => {
  try {
    await setActiveChatBackground(null);
    refreshBackgrounds();
  } catch (e) {
    console.log('恢复默认聊天背景失败', e);
    feedback.message.error(
      t('settings.generalSettings.chatBackgroundApplyFailed'),
    );
  }
};

const handleBackgroundDelete = async (id: number) => {
  try {
    await deleteChatBackground(id);
    refreshBackgrounds();
  } catch (e) {
    console.log('删除聊天背景失败', e);
    feedback.message.error(
      t('settings.generalSettings.chatBackgroundApplyFailed'),
    );
  }
};

const activeBackground = computed(() =>
  backgrounds.value.find((item) => item.is_active),
);

const onThumbKeydown = (e: KeyboardEvent, id: number) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleBackgroundSelect(id);
  }
};
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.generalSettings.title') }}
    </a-typography-title>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <PoweroffOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.generalSettings.autoStart') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-switch
        :checked="autoStartEnabled"
        :loading="autoStartLoading"
        :class="styles.settingSwitch"
        @change="handleAutoStartChange"
      />
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.generalSettings.autoStartDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <GlobalOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.generalSettings.language') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-select
        :value="locale"
        :class="styles.select"
        @change="handleLanguageChange"
      >
        <a-select-option value="zh-CN">
          {{ t('language.chinese') }}
        </a-select-option>
        <a-select-option value="zh-TW">
          {{ t('language.traditional') }}
        </a-select-option>
        <a-select-option value="en-US">English</a-select-option>
      </a-select>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.generalSettings.languageDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <FontSizeOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.generalSettings.theme') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-select :value="mode" :class="styles.select" @change="onThemeChange">
        <a-select-option value="light">
          {{ t('settings.generalSettings.themeModes.light') }}
        </a-select-option>
        <a-select-option value="dark">
          {{ t('settings.generalSettings.themeModes.dark') }}
        </a-select-option>
        <a-select-option value="system">
          {{ t('settings.generalSettings.themeModes.system') }}
        </a-select-option>
      </a-select>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.generalSettings.themeDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <FontSizeOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.generalSettings.fontSize') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-select
        :value="fontSize"
        :class="styles.select"
        @change="onFontSizeChange"
      >
        <a-select-option value="small">
          {{ t('settings.generalSettings.fontSizes.small') }}
        </a-select-option>
        <a-select-option value="medium">
          {{ t('settings.generalSettings.fontSizes.medium') }}
        </a-select-option>
        <a-select-option value="large">
          {{ t('settings.generalSettings.fontSizes.large') }}
        </a-select-option>
      </a-select>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.generalSettings.fontSizeDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <PictureOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.generalSettings.chatBackground') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />

      <!-- 预览: 背景铺进一个"假聊天窗口", 直接看消息气泡在背景上的可读性 -->
      <div
        :class="[styles.bgStage, activeBackground ? '' : styles.bgStageBlank]"
      >
        <template v-if="activeBackground">
          <img
            :class="styles.bgStageImg"
            :src="resolveChatBackgroundUrl(activeBackground.file_path)"
            alt=""
          />
          <span :class="styles.bgStageScrim" />
          <span :class="styles.bgStageChip">
            {{ t('settings.generalSettings.chatBackgroundInUse') }}
          </span>
          <span :class="styles.bgBubbles">
            <span :class="[styles.bgBubble, styles.bgBubbleIn]" />
            <span :class="[styles.bgBubble, styles.bgBubbleOut]" />
            <span
              :class="[
                styles.bgBubble,
                styles.bgBubbleIn,
                styles.bgBubbleShort,
              ]"
            />
          </span>
          <div :class="styles.bgStageActions">
            <a-button
              size="small"
              type="primary"
              :loading="backgroundUploading"
              @click="handleBackgroundUpload"
            >
              <template #icon><UploadOutlined /></template>
              {{
                t(
                  backgroundUploading
                    ? 'settings.generalSettings.chatBackgroundUploading'
                    : 'settings.generalSettings.chatBackgroundUpload',
                )
              }}
            </a-button>
            <a-button
              size="small"
              :class="styles.bgGhostBtn"
              @click="handleBackgroundReset"
            >
              {{ t('settings.generalSettings.chatBackgroundReset') }}
            </a-button>
          </div>
        </template>
        <div v-else :class="styles.bgStageEmpty">
          <PictureOutlined :class="styles.bgStageEmptyIcon" />
          <span :class="styles.bgStageEmptyText">
            {{ t('settings.generalSettings.chatBackgroundEmpty') }}
          </span>
          <a-button
            type="primary"
            :loading="backgroundUploading"
            @click="handleBackgroundUpload"
          >
            <template #icon><UploadOutlined /></template>
            {{
              t(
                backgroundUploading
                  ? 'settings.generalSettings.chatBackgroundUploading'
                  : 'settings.generalSettings.chatBackgroundUpload',
              )
            }}
          </a-button>
        </div>
      </div>

      <template v-if="backgrounds.length > 0">
        <div :class="styles.bgStripLabel">
          {{ t('settings.generalSettings.chatBackgroundHistory') }}
        </div>
        <div :class="styles.bgStrip">
          <div
            v-for="item in backgrounds"
            :key="item.id"
            role="button"
            tabindex="0"
            :class="[
              styles.bgThumbItem,
              item.is_active ? styles.bgThumbActive : '',
            ]"
            @click="handleBackgroundSelect(item.id)"
            @keydown="(e) => onThumbKeydown(e, item.id)"
          >
            <img
              :class="styles.bgThumbImg"
              :src="resolveChatBackgroundUrl(item.file_path)"
              alt=""
            />
            <CheckCircleFilled
              v-if="item.is_active"
              :class="styles.bgThumbCheck"
            />
            <a-popconfirm
              :title="t('settings.generalSettings.chatBackgroundDeleteConfirm')"
              @confirm="handleBackgroundDelete(item.id)"
            >
              <button
                type="button"
                :class="styles.bgThumbDelete"
                :aria-label="t('common.delete')"
                @click.stop
              >
                ×
              </button>
            </a-popconfirm>
          </div>
        </div>
      </template>

      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.generalSettings.chatBackgroundDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <DownloadOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.generalSettings.autoDownload') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-checkbox
        :checked="autoDownloadWifi"
        :class="styles.settingCheckbox"
        @change="onAutoDownloadChange"
      >
        {{ t('settings.generalSettings.autoDownloadWifi') }}
      </a-checkbox>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.generalSettings.autoDownloadDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <CodeOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.generalSettings.devAssistant') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-switch
        :checked="devAssistant.visible"
        :class="styles.settingSwitch"
        @change="handleDevAssistantChange"
      />
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.generalSettings.devAssistantDesc') }}
      </a-typography-text>
    </a-card>
  </div>
</template>
