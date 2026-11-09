<script setup lang="ts">
/**
 * 视频面板：远端画面 / 头像占位 / 本地小窗 / 通话信息条 / 媒体控制条
 *
 * 现代化要点：
 * - 远端无画面（语音通话或对方关摄像头）时展示头像光晕占位，而非黑屏
 * - 顶部信息条常驻：好友名 + 连接状态 + 通话计时
 * - 底部悬浮胶囊控制条：麦克风 / 摄像头 / 挂断
 */
import { DEFAULT_ICON } from '@/constants';
import { useI18n } from '@/i18n';
import {
  AudioMutedOutlined,
  AudioOutlined,
  PhoneOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import styles from '../index.module.less';

const props = defineProps<{
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isConnected: boolean;
  friendName?: string;
  friendAvatar?: string;
  callDurationText: string;
  statusText: string;
  /** 远端媒体流：用于监听视频轨 mute/unmute（对方开关摄像头） */
  remoteStream?: MediaStream | null;
  /** 本地媒体流：小窗常驻挂载，切开关时重新绑定 */
  localStream?: MediaStream | null;
  localVideoRef: Ref<HTMLVideoElement | null>;
  remoteVideoRef: Ref<HTMLVideoElement | null>;
}>();

defineEmits<{
  (e: 'toggle-video'): void;
  (e: 'toggle-audio'): void;
  (e: 'hangup'): void;
}>();

const { t } = useI18n();
const hasRemoteVideo = ref(false);

// 远端是否有画面：
// - 语音通话没有视频轨，videoWidth 恒为 0
// - 对方关摄像头时轨道会进入 muted，画面停在最后一帧，需要靠 mute/unmute 事件感知
// 元素事件与轨道事件共同驱动，避免流先于 ref 挂载时状态不同步
watch(
  [() => props.remoteStream, () => props.remoteVideoRef.value],
  (_value, _oldValue, onCleanup) => {
    const video = props.remoteVideoRef.value;
    if (!video) return;

    const sync = () => {
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      if (track?.muted) {
        hasRemoteVideo.value = false;
        return;
      }
      hasRemoteVideo.value = video.readyState >= 2 && video.videoWidth > 0;
    };

    const track = props.remoteStream?.getVideoTracks()[0] ?? null;
    const onUnmute = () => {
      video.play().catch(() => {});
      sync();
    };
    const onMute = () => {
      hasRemoteVideo.value = false;
    };

    sync();
    video.addEventListener('playing', sync);
    video.addEventListener('loadeddata', sync);
    video.addEventListener('resize', sync);
    video.addEventListener('emptied', sync);
    track?.addEventListener('mute', onMute);
    track?.addEventListener('unmute', onUnmute);
    onCleanup(() => {
      video.removeEventListener('playing', sync);
      video.removeEventListener('loadeddata', sync);
      video.removeEventListener('resize', sync);
      video.removeEventListener('emptied', sync);
      track?.removeEventListener('mute', onMute);
      track?.removeEventListener('unmute', onUnmute);
    });
  },
  { immediate: true, flush: 'post' },
);

const avatar = computed(() => props.friendAvatar || DEFAULT_ICON);
const hasLocalVideoTrack = computed(
  () => !!props.localStream?.getVideoTracks().length,
);

// 本地小窗 <video> 常驻挂载，这里在流可用时绑定并播放。
// 之前小窗随 isVideoEnabled 卸载/重挂载，新元素 srcObject 为空 → 重新开摄像头后预览黑屏。
watch(
  [() => props.localStream, () => props.localVideoRef.value],
  () => {
    const video = props.localVideoRef.value;
    if (!video) return;
    if (video.srcObject !== (props.localStream ?? null)) {
      video.srcObject = props.localStream ?? null;
    }
    if (props.localStream) {
      video.play().catch(() => {});
    }
  },
  { immediate: true, flush: 'post' },
);

// 小窗只是 display:none 隐藏，重新打开时补一次 play，避免被浏览器挂起
watch(
  () => props.isVideoEnabled,
  (enabled) => {
    if (!enabled) return;
    props.localVideoRef.value?.play().catch(() => {});
  },
);
</script>

<template>
  <div :class="styles.videoPanel">
    <div :class="styles.stageArea">
      <video
        :ref="remoteVideoRef"
        autoplay
        playsinline
        :class="styles.remoteVideo"
      />

      <div v-if="!hasRemoteVideo" :class="styles.stagePlaceholder">
        <div :class="styles.stageAvatarHalo">
          <span :class="styles.stageAvatarRing" />
          <img :class="styles.stageAvatar" :src="avatar" alt="" />
        </div>
        <div :class="styles.stageName">
          {{ friendName || t('webrtc.videoChat') }}
        </div>
        <div :class="styles.stageHint">{{ statusText }}</div>
      </div>

      <div :class="styles.callInfoBar">
        <span
          :class="[styles.infoDot, isConnected ? styles.infoDotLive : '']"
        />
        <span :class="styles.infoName">
          {{ friendName || t('webrtc.peer') }}
        </span>
        <span :class="styles.infoDivider" />
        <span
          :class="[styles.infoTimer, isConnected ? styles.infoTimerLive : '']"
        >
          {{ isConnected ? callDurationText : statusText }}
        </span>
      </div>

      <div
        :class="[
          styles.localVideoContainer,
          isVideoEnabled ? '' : styles.localVideoHidden,
        ]"
      >
        <video
          :ref="localVideoRef"
          autoplay
          playsinline
          muted
          :class="styles.localVideo"
        />
        <span v-if="!hasLocalVideoTrack" :class="styles.localEmpty">
          {{ t('call.cameraUnavailable') }}
        </span>
        <span :class="styles.localBadge">{{ t('webrtc.local') }}</span>
        <span v-if="!isAudioEnabled" :class="styles.localMutedBadge">
          <AudioMutedOutlined />
        </span>
      </div>

      <div :class="styles.controlDock">
        <a-tooltip :title="t(isAudioEnabled ? 'call.mute' : 'call.unmute')">
          <button
            type="button"
            :class="[styles.dockBtn, isAudioEnabled ? '' : styles.dockBtnOff]"
            @click="$emit('toggle-audio')"
          >
            <AudioOutlined v-if="isAudioEnabled" />
            <AudioMutedOutlined v-else />
          </button>
        </a-tooltip>
        <a-tooltip :title="t(isVideoEnabled ? 'call.videoOff' : 'call.videoOn')">
          <button
            type="button"
            :class="[styles.dockBtn, isVideoEnabled ? '' : styles.dockBtnOff]"
            @click="$emit('toggle-video')"
          >
            <VideoCameraOutlined v-if="isVideoEnabled" />
            <VideoCameraAddOutlined v-else />
          </button>
        </a-tooltip>
        <button
          type="button"
          :class="styles.hangupBtn"
          :title="t('call.hangup')"
          @click="$emit('hangup')"
        >
          <PhoneOutlined :rotate="135" />
        </button>
      </div>
    </div>
  </div>
</template>
