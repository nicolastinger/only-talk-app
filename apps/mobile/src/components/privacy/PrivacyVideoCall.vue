<script setup lang="ts">
/**
 * 移动端隐私模式音视频通话（QUIC P2P + WebCodecs 裸帧）。
 *
 * 与 PC 端 `PrivacyVideoCall` 使用完全相同的帧协议与解码器配置帧。
 * 只有能力检测通过（见 media/capabilities.ts）时才会挂载本组件。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { showToast } from "vant";
import type { MediaControl, VideoCallInvite } from "@workspace/types";
import { useI18n } from "@/i18n";
import { DEFAULT_AVATAR } from "@/stores/user";
import { defaultMediaConfig } from "@/privacy/media/config";
import { createMediaSession } from "@/privacy/media/mediaSession";
import * as videoEncoder from "@/privacy/media/videoEncoder";
import * as videoDecoder from "@/privacy/media/videoDecoder";
import * as audioEncoder from "@/privacy/media/audioEncoder";
import * as audioDecoder from "@/privacy/media/audioDecoder";
import {
  registerP2pMediaChannels,
  registerP2pMediaEvents,
} from "@/privacy/media/p2pEvents";
import * as transport from "@/privacy/media/p2pTransport";

type CallPhase = "calling" | "connecting" | "connected" | "ended";

const props = defineProps<{
  friendId: string;
  isInitiator: boolean;
  friendName?: string;
  friendAvatar?: string;
  invite?: VideoCallInvite | null;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const { t } = useI18n();

const session = createMediaSession();
const phase = ref<CallPhase>(props.isInitiator ? "calling" : "connecting");
const videoEnabled = ref(true);
const audioEnabled = ref(true);
const remoteReady = ref(false);

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRef = ref<HTMLVideoElement | null>(null);
const remoteAudioRef = ref<HTMLAudioElement | null>(null);

let unlisteners: Array<() => void> = [];
let ended = false;
let startingLocal = false;
let ringTimer: ReturnType<typeof setTimeout> | null = null;

const RING_TIMEOUT_MS = 45_000;

const displayName = computed(
  () =>
    props.invite?.from_name ||
    props.friendName ||
    props.friendId ||
    t("privacyChat.other")
);
const avatar = computed(() => props.friendAvatar || DEFAULT_AVATAR);
const phaseText = computed(() => {
  if (phase.value === "calling") return t("privacyChat.calling");
  if (phase.value === "connecting") return t("privacyChat.connecting");
  if (phase.value === "connected") return t("privacyChat.connected");
  return t("privacyChat.callEnded");
});

const playVideo = (el: HTMLVideoElement | null) => {
  if (!el) return;
  el.play().catch(() => {
    // 自动播放被拦截时静默忽略（本地预览通常不受影响）
  });
};

const handleMediaControl = (control: MediaControl) => {
  if (control.control_type === "VideoToggle") {
    videoEnabled.value = control.enabled;
  } else if (control.control_type === "AudioToggle") {
    audioEnabled.value = control.enabled;
  } else if (control.control_type === "EndCall") {
    void endCall(false);
  }
};

const maybeStartSending = () => {
  if (ended || session.isMediaSending) return;
  if (!remoteReady.value || !session.localStream) return;
  session.isMediaSending = true;
  if (session.mediaSendDelayTimer) clearTimeout(session.mediaSendDelayTimer);
  // 等对端接收器/解码器就绪后再发首帧配置与关键帧，避免黑屏
  session.mediaSendDelayTimer = setTimeout(() => {
    if (ended || !session.localStream) return;
    void videoEncoder.startVideoWebCodecs(
      session,
      props.friendId,
      session.localStream
    );
    void audioEncoder.startAudioWebCodecs(
      session,
      props.friendId,
      session.localStream
    );
    phase.value = "connected";
  }, 1000);
};

const startLocalMedia = async () => {
  if (ended || startingLocal || session.localStream) return;
  startingLocal = true;
  phase.value = "connecting";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: defaultMediaConfig.video_config.width },
        height: { ideal: defaultMediaConfig.video_config.height },
        frameRate: { ideal: defaultMediaConfig.video_config.fps },
        facingMode: "user",
      },
      audio: {
        echoCancellation: defaultMediaConfig.audio_config.echo_cancellation,
        noiseSuppression: defaultMediaConfig.audio_config.noise_suppression,
        autoGainControl: defaultMediaConfig.audio_config.auto_gain_control,
        sampleRate: defaultMediaConfig.audio_config.sample_rate,
        channelCount: defaultMediaConfig.audio_config.channels,
      },
    });
    if (ended) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    session.localStream = stream;
    if (localVideoRef.value) {
      localVideoRef.value.srcObject = stream;
      playVideo(localVideoRef.value);
    }

    await transport.sendP2pMediaConfig(
      props.friendId,
      JSON.stringify(defaultMediaConfig)
    );
    await transport.sendP2pMediaReady(props.friendId);
    maybeStartSending();
  } catch (e) {
    console.error("[PrivacyVideoCall] 初始化本地媒体失败:", e);
    showToast(t("privacyChat.mediaError"));
    void endCall(true);
  } finally {
    startingLocal = false;
  }
};

const onVideoCallAccept = (payload: string) => {
  try {
    const response = JSON.parse(payload) as { from_uuid?: string };
    if (response.from_uuid && response.from_uuid !== props.friendId) return;
  } catch {
    // 兼容纯 uuid payload
  }
  if (!props.isInitiator) return;
  if (phase.value !== "calling" && phase.value !== "connecting") return;
  if (ringTimer) {
    clearTimeout(ringTimer);
    ringTimer = null;
  }
  void startLocalMedia();
};

const onVideoCallReject = (payload: string) => {
  let reason = t("privacyChat.userRejected");
  try {
    const response = JSON.parse(payload) as {
      from_uuid?: string;
      reject_reason?: string;
    };
    if (response.from_uuid && response.from_uuid !== props.friendId) return;
    if (response.reject_reason) reason = response.reject_reason;
  } catch {
    // 兼容纯 uuid payload
  }
  showToast(reason);
  void endCall(false);
};

const onVideoCallEnd = (payload: string) => {
  if (payload && payload !== props.friendId) return;
  void endCall(false);
};

const onMediaReady = (payload: string) => {
  if (payload && payload !== props.friendId) return;
  remoteReady.value = true;
  maybeStartSending();
};

const registerMedia = async () => {
  videoDecoder.initVideoReceiver(session, remoteVideoRef.value);
  audioDecoder.initAudioReceiver(session, remoteAudioRef.value);

  unlisteners = unlisteners.concat(
    await registerP2pMediaChannels(props.friendId, {
      onVideoFrame: (payload) =>
        videoDecoder.handleWebCodecsVideoFrame(session, props.friendId, payload),
      onAudioFrame: (payload) =>
        audioDecoder.handleWebCodecsAudioFrame(session, payload),
    })
  );

  unlisteners = unlisteners.concat(
    await registerP2pMediaEvents({
      onMediaControl: handleMediaControl,
      onVideoCallAccept,
      onVideoCallReject,
      onVideoCallEnd,
      onMediaInfo: () => {},
      onMediaReady,
    })
  );
};

const toggleVideo = async () => {
  videoEnabled.value = !videoEnabled.value;
  const track = session.localStream?.getVideoTracks()[0];
  if (track) track.enabled = videoEnabled.value;
  await transport
    .sendP2pMediaControl(props.friendId, "VideoToggle", videoEnabled.value)
    .catch(() => {});
};

const toggleAudio = async () => {
  audioEnabled.value = !audioEnabled.value;
  const track = session.localStream?.getAudioTracks()[0];
  if (track) track.enabled = audioEnabled.value;
  await transport
    .sendP2pMediaControl(props.friendId, "AudioToggle", audioEnabled.value)
    .catch(() => {});
};

const cleanup = () => {
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
  if (session.keyframeTimer) clearInterval(session.keyframeTimer);
  session.keyframeTimer = null;
  if (session.mediaSendDelayTimer) clearTimeout(session.mediaSendDelayTimer);
  session.mediaSendDelayTimer = null;
  if (session.mediaInfoInterval) clearInterval(session.mediaInfoInterval);
  session.mediaInfoInterval = null;

  try {
    session.videoEncoder?.close();
  } catch {
    // ignore
  }
  session.videoEncoder = null;
  void session.videoReader?.cancel().catch(() => {});
  session.videoReader = null;
  session.videoTrackProcessor = null;

  try {
    session.audioEncoder?.close();
  } catch {
    // ignore
  }
  session.audioEncoder = null;
  void session.audioReader?.cancel().catch(() => {});
  session.audioReader = null;
  session.audioTrackProcessor = null;

  session.localStream?.getTracks().forEach((track) => track.stop());
  session.localStream = null;

  try {
    session.videoDecoder?.close();
  } catch {
    // ignore
  }
  session.videoDecoder = null;
  session.pendingVideoFrames = [];
  session.videoFirstKeyframeReceived = false;

  try {
    session.audioDecoder?.close();
  } catch {
    // ignore
  }
  session.audioDecoder = null;

  if (session.audioContext) {
    void session.audioContext.close().catch(() => {});
    session.audioContext = null;
  }

  if (session.remoteCanvasStream) {
    session.remoteCanvasStream.getTracks().forEach((track) => track.stop());
    session.remoteCanvasStream = null;
  }

  session.isMediaSending = false;
  unlisteners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
  unlisteners = [];
};

const endCall = async (notify: boolean) => {
  if (ended) return;
  ended = true;
  phase.value = "ended";
  cleanup();
  if (notify) {
    await transport.sendP2pVideoCallEnd(props.friendId).catch(() => {});
  }
  emit("close");
};

onMounted(async () => {
  await nextTick();
  try {
    await registerMedia();
  } catch (e) {
    console.error("[PrivacyVideoCall] 注册媒体通道失败:", e);
    showToast(t("privacyChat.mediaError"));
    void endCall(false);
    return;
  }
  if (props.isInitiator) {
    // from_name 是「主叫方」昵称，这里不传：被叫端用自己好友资料里的昵称展示，
    // 避免把对方(被叫)的名字当成主叫名字。
    await transport
      .sendP2pVideoCallInvite(props.friendId, null)
      .catch((e) => {
        console.error("[PrivacyVideoCall] 发送邀请失败:", e);
        void endCall(false);
      });
    if (!ended && phase.value === "calling") {
      ringTimer = setTimeout(() => {
        if (ended || phase.value !== "calling") return;
        showToast(t("privacyChat.noResponse"));
        void endCall(true);
      }, RING_TIMEOUT_MS);
    }
    return;
  }
  // 接听方：先回 accept，再初始化本地媒体
  try {
    await transport.sendP2pVideoCallResponse(props.friendId, {
      accept: true,
      mediaConfig: JSON.stringify(defaultMediaConfig),
      rejectReason: null,
    });
  } catch (e) {
    console.error("[PrivacyVideoCall] 发送接听响应失败:", e);
    void endCall(false);
    return;
  }
  void startLocalMedia();
});

onUnmounted(() => {
  if (!ended) {
    ended = true;
    // 页面被外部关闭时也要通知对端结束通话（失败忽略）
    void transport.sendP2pVideoCallEnd(props.friendId).catch(() => {});
    cleanup();
  }
});
</script>

<template>
  <div class="call-screen">
    <video
      ref="remoteVideoRef"
      class="remote-video"
      autoplay
      playsinline
      muted
    ></video>
    <audio ref="remoteAudioRef" class="remote-audio" autoplay></audio>

    <div v-if="phase !== 'connected'" class="call-status">
      <img class="call-avatar" :src="avatar" :alt="displayName" />
      <div class="call-name">{{ displayName }}</div>
      <div class="call-phase">{{ phaseText }}</div>
    </div>

    <video
      ref="localVideoRef"
      class="local-video"
      autoplay
      playsinline
      muted
    ></video>

    <div class="call-topbar">
      <span class="call-topbar-name">{{ displayName }}</span>
    </div>

    <div class="call-actions">
      <button
        class="call-action"
        :class="{ off: !audioEnabled }"
        type="button"
        :aria-label="audioEnabled ? t('privacyChat.mute') : t('privacyChat.unmute')"
        @click="toggleAudio"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
          />
        </svg>
      </button>

      <button
        class="call-action hangup"
        type="button"
        :aria-label="t('privacyChat.hangup')"
        @click="endCall(true)"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
          />
        </svg>
      </button>

      <button
        class="call-action"
        :class="{ off: !videoEnabled }"
        type="button"
        :aria-label="videoEnabled ? t('privacyChat.cameraOff') : t('privacyChat.cameraOn')"
        @click="toggleVideo"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.call-screen {
  position: fixed;
  inset: 0;
  z-index: 3300;
  background: #000;
  overflow: hidden;
}

.remote-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.remote-audio {
  display: none;
}

.local-video {
  position: absolute;
  top: calc(58px + env(safe-area-inset-top));
  right: 14px;
  width: 30vw;
  max-width: 140px;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  transform: scaleX(-1);
  background: #111;
}

.call-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: calc(12px + env(safe-area-inset-top)) 18px 12px;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.55) 0%,
    rgba(0, 0, 0, 0) 100%
  );
}

.call-topbar-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.call-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  background: radial-gradient(
    circle at 50% 40%,
    rgba(30, 64, 120, 0.55) 0%,
    rgba(0, 0, 0, 0.92) 70%
  );
}

.call-avatar {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.35);
}

.call-name {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.call-phase {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
}

.call-actions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(30px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 34px;
}

.call-action {
  width: 54px;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-tap-highlight-color: transparent;
  transition: background var(--transition-fast, 0.15s ease);

  svg {
    width: 24px;
    height: 24px;
  }

  &:active {
    background: rgba(255, 255, 255, 0.3);
  }

  &.off {
    background: rgba(255, 255, 255, 0.9);
    color: #111;
  }

  &.hangup {
    width: 62px;
    height: 62px;
    background: #ef4444;

    svg {
      width: 28px;
      height: 28px;
    }
  }
}
</style>
