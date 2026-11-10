<script setup lang="ts">
/**
 * 视频区域：远程视频/音频 + 本地视频 + 等待/关闭遮罩
 */
import type { Ref } from 'vue';
import { VideoCameraOutlined } from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import type { CallPhase } from '../lib/callState';
import styles from '../index.module.less';

const { t } = useI18n();

defineProps<{
  remoteVideoRef: Ref<HTMLVideoElement | null>;
  remoteAudioRef: Ref<HTMLAudioElement | null>;
  localVideoRef: Ref<HTMLVideoElement | null>;
  isInCall: boolean;
  callPhase: CallPhase;
  videoEnabled: boolean;
}>();
</script>

<template>
  <div :class="styles.videoWrapper">
    <!-- 远程视频 - 对方视频 -->
    <div :class="styles.remoteVideo">
      <video
        :ref="remoteVideoRef"
        autoplay
        playsinline
        :class="styles.video"
      />
      <!-- 远程音频 - 对方音频 -->
      <audio :ref="remoteAudioRef" autoplay />
      <!-- 等待连接提示 -->
      <div
        v-if="!isInCall && callPhase !== 'Calling' && callPhase !== 'Ringing'"
        :class="styles.waitingOverlay"
      >
        <span>{{ t('privacyChat.waitingPeer') }}</span>
      </div>
    </div>

    <!-- 本地视频 - 自己的视频 -->
    <div :class="styles.localVideo">
      <video
        :ref="localVideoRef"
        autoplay
        playsinline
        muted
        :class="styles.video"
      />
      <!-- 视频关闭遮罩 -->
      <div v-if="!videoEnabled" :class="styles.videoOffOverlay">
        <VideoCameraOutlined :style="{ fontSize: 32 }" />
      </div>
    </div>
  </div>
</template>
