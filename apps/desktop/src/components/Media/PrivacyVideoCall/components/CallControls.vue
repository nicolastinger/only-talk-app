<script setup lang="ts">
/**
 * 控制按钮区域：音频/视频开关、重启媒体、结束通话、退出
 */
import {
  AudioMutedOutlined,
  AudioOutlined,
  LogoutOutlined,
  PhoneOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import type { MediaControlState } from '@workspace/types';
import { useI18n } from '@/i18n';
import styles from '../index.module.less';

const { t } = useI18n();

defineProps<{
  mediaState: MediaControlState;
  isRestarting: boolean;
  isInCall: boolean;
}>();

defineEmits<{
  (e: 'toggle-audio'): void;
  (e: 'toggle-video'): void;
  (e: 'restart'): void;
  (e: 'end'): void;
  (e: 'exit'): void;
}>();
</script>

<template>
  <div :class="styles.controls">
    <!-- 音频开关按钮 -->
    <a-tooltip
      :title="
        mediaState.audioEnabled
          ? t('webrtc.closeMicrophone')
          : t('webrtc.openMicrophone')
      "
    >
      <a-button
        :type="mediaState.audioEnabled ? 'primary' : 'default'"
        shape="circle"
        size="large"
        :class="styles.controlButton"
        @click="$emit('toggle-audio')"
      >
        <template #icon>
          <AudioOutlined v-if="mediaState.audioEnabled" />
          <AudioMutedOutlined v-else />
        </template>
      </a-button>
    </a-tooltip>

    <!-- 视频开关按钮 -->
    <a-tooltip
      :title="
        mediaState.videoEnabled
          ? t('webrtc.closeCamera')
          : t('webrtc.openCamera')
      "
    >
      <a-button
        :type="mediaState.videoEnabled ? 'primary' : 'default'"
        shape="circle"
        size="large"
        :class="styles.controlButton"
        @click="$emit('toggle-video')"
      >
        <template #icon><VideoCameraOutlined /></template>
      </a-button>
    </a-tooltip>

    <!-- 重启媒体按钮 - 作为黑屏问题的兜底方案 -->
    <a-tooltip :title="t('privacyChat.restartMedia')">
      <a-button
        type="default"
        shape="circle"
        size="large"
        :disabled="isRestarting || !isInCall"
        :class="styles.controlButton"
        @click="$emit('restart')"
      >
        <template #icon><ReloadOutlined :spin="isRestarting" /></template>
      </a-button>
    </a-tooltip>

    <!-- 结束通话按钮 -->
    <a-tooltip :title="t('privacyChat.endCall')">
      <a-button
        type="primary"
        danger
        shape="circle"
        size="large"
        :class="styles.endCallButton"
        @click="$emit('end')"
      >
        <template #icon><PhoneOutlined /></template>
      </a-button>
    </a-tooltip>

    <!-- 退出按钮 -->
    <a-tooltip :title="t('privacyChat.exitChat')">
      <a-button
        type="default"
        danger
        shape="circle"
        size="large"
        :class="styles.exitButton"
        @click="$emit('exit')"
      >
        <template #icon><LogoutOutlined /></template>
      </a-button>
    </a-tooltip>
  </div>
</template>
