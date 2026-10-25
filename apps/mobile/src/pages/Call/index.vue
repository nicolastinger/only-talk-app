<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallManager } from "@/webrtc/callManager";
import type { CallStage } from "@/webrtc/callManager";
import { useAvatar } from "@/hooks/useAvatar";
import { useI18n } from "@/i18n";
import { DEFAULT_AVATAR } from "@/stores/user";
import type { ChatSessionVo } from "@workspace/types";

const router = useRouter();
const { t } = useI18n();
const { call, localStream, remoteStream, accept, decline, hangup, retry, toggleAudio, toggleVideo, switchCamera } = useCallManager();

const { getAvatarUrl } = useAvatar();

const friend = reactive({ name: "", icon: "", avatar: "" });
const loadingInfo = ref(false);

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRef = ref<HTMLVideoElement | null>(null);

const friendId = computed(() => call.friendId);

const isVideo = computed(() => call.media === "video");
const isRinging = computed(
  () => call.stage === "outgoing" || call.stage === "incoming"
);
// 对方是否有画面：不能直接读 track.muted —— 远端轨道初始恒为 muted，且该属性不是响应式的，
// 只靠 computed 永远得到 false，远端 <video> 会一直被隐藏，表现为「看不到对方的视频」。
// 这里改为 track 的 mute/unmute 事件 + video 元素的 loadeddata/resize 事件共同驱动。
const remoteHasVideo = ref(false);
let detachRemoteTrack: (() => void) | null = null;

const attachRemoteTrack = (stream: MediaStream | null) => {
  detachRemoteTrack?.();
  detachRemoteTrack = null;
  const track = stream?.getVideoTracks()[0];
  if (!track) {
    remoteHasVideo.value = false;
    return;
  }
  const sync = () => {
    remoteHasVideo.value = !track.muted;
    if (!track.muted) remoteVideoRef.value?.play().catch(() => {});
  };
  track.addEventListener("mute", sync);
  track.addEventListener("unmute", sync);
  detachRemoteTrack = () => {
    track.removeEventListener("mute", sync);
    track.removeEventListener("unmute", sync);
  };
  sync();
};

// 有些机型 track.muted 不会及时翻转，用元素尺寸兜底
const syncRemoteFrame = () => {
  const video = remoteVideoRef.value;
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    remoteHasVideo.value = true;
  }
};

const showRemoteVideo = computed(
  () => call.stage === "connected" && isVideo.value && remoteHasVideo.value
);
const showLocalPreview = computed(
  () => isVideo.value && call.videoOn && !!localStream.value && call.stage !== "idle"
);
const showCallInfo = computed(
  () => call.active && call.stage !== "idle" && call.stage !== "ended" && call.stage !== "rejected"
);

const stageText = computed(() => {
  switch (call.stage) {
    case "outgoing":
      return t("call.outgoing");
    case "incoming":
      return isVideo.value ? t("call.incomingVideo") : t("call.incomingAudio");
    case "connecting":
      return t("call.connecting");
    case "connected":
      return formatDuration(call.elapsedSec);
    case "ended":
      return call.errorMsg || t("call.ended");
    case "rejected":
      return call.errorMsg || t("call.canceled");
    case "failed":
      return call.errorMsg || t("call.failed");
    default:
      return "";
  }
});

const mediaLabel = computed(() =>
  isVideo.value ? t("chat.tools.video") : t("chat.tools.audio")
);

const backdropStyle = computed(() =>
  friend.avatar ? { backgroundImage: `url("${friend.avatar}")` } : {}
);

function formatDuration(sec: number): string {
  const safe = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const loadFriend = async () => {
  try {
    loadingInfo.value = true;
    const sessions: ChatSessionVo[] = await invoke("get_chat_session_from_store");
    const session = sessions.find(
      (s) => s.send_user === friendId.value || s.recv_user === friendId.value
    );
    if (session) {
      friend.name = session.friend_name || friendId.value;
      friend.icon = session.friend_icon || "";
    } else {
      friend.name = friendId.value;
    }
    if (friend.icon) {
      const url = await getAvatarUrl(friend.icon);
      if (url) friend.avatar = url;
    }
  } catch {
    friend.name = friendId.value;
  } finally {
    loadingInfo.value = false;
  }
};

const bindStream = (video: HTMLVideoElement | null, stream: MediaStream | null) => {
  if (!video) return;
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  if (stream) video.play().catch(() => {});
};

watch(localStream, async (s) => {
  await nextTick();
  bindStream(localVideoRef.value, s);
});
watch(remoteStream, async (s) => {
  await nextTick();
  bindStream(remoteVideoRef.value, s);
  attachRemoteTrack(s);
});

watch(
  () => call.stage,
  async (stage: CallStage) => {
    if (stage === "connected") {
      await nextTick();
      bindStream(localVideoRef.value, localStream.value);
      bindStream(remoteVideoRef.value, remoteStream.value);
      attachRemoteTrack(remoteStream.value);
      syncRemoteFrame();
    }
  }
);

// 未登录/无活跃通话时不应停留在此页
onMounted(async () => {
  const video = remoteVideoRef.value;
  video?.addEventListener("loadeddata", syncRemoteFrame);
  video?.addEventListener("playing", syncRemoteFrame);
  video?.addEventListener("resize", syncRemoteFrame);

  if (!call.active || !call.friendId) {
    router.replace("/chats");
    return;
  }
  await loadFriend();
});

onUnmounted(() => {
  const video = remoteVideoRef.value;
  video?.removeEventListener("loadeddata", syncRemoteFrame);
  video?.removeEventListener("playing", syncRemoteFrame);
  video?.removeEventListener("resize", syncRemoteFrame);
  detachRemoteTrack?.();
  detachRemoteTrack = null;

  // 非终结态下离开页面（如安卓返回键）视为挂断
  if (
    call.active &&
    ["outgoing", "incoming", "connecting", "connected", "failed"].includes(
      call.stage
    )
  ) {
    if (call.stage === "incoming") decline();
    else hangup();
  }
});

const coverAvatar = computed(
  () => friend.avatar || DEFAULT_AVATAR
);
</script>

<template>
  <div class="call-page">
    <!-- 模糊头像背景 -->
    <div class="call-backdrop" :style="backdropStyle"></div>
    <div class="call-scrim"></div>

    <!-- 远端画面 -->
    <video
      v-show="showRemoteVideo"
      ref="remoteVideoRef"
      class="remote-video"
      autoplay
      playsinline
    ></video>

    <!-- 无远端画面时的头像舞台（语音通话 / 对方关闭画面） -->
    <div v-if="!showRemoteVideo" class="call-stage">
      <div class="stage-avatar" :class="{ ringing: isRinging }">
        <span class="stage-ring"></span>
        <span class="stage-ring delay"></span>
        <img :src="coverAvatar" alt="" />
      </div>
    </div>

    <!-- 顶部通话信息 -->
    <div v-if="showCallInfo" class="call-top">
      <div class="call-name">{{ friend.name || friendId }}</div>
      <div class="call-meta">
        <span class="call-type">
          <svg v-if="isVideo" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
            />
          </svg>
          {{ mediaLabel }}
        </span>
        <span
          class="call-stage-text"
          :class="{ 'stage-timer': call.stage === 'connected' }"
        >
          <i v-if="call.stage === 'connected'" class="timer-dot"></i>
          {{ stageText }}
        </span>
      </div>
    </div>

    <!-- 本地预览 -->
    <div v-show="showLocalPreview" class="local-preview">
      <video ref="localVideoRef" autoplay playsinline muted></video>
      <span class="local-badge">{{ t("webrtc.local") }}</span>
      <span v-if="!call.audioOn" class="local-muted">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"
          />
        </svg>
      </span>
    </div>

    <!-- 失败提示 -->
    <div v-if="call.stage === 'failed'" class="failed-panel">
      <div class="failed-text">{{ t("call.failedRetry") }}</div>
      <div class="failed-actions">
        <button type="button" class="ctrl-btn retry" @click="retry">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
          <span>{{ t("call.retry") }}</span>
        </button>
        <button type="button" class="ctrl-btn hang" @click="hangup">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
            />
          </svg>
          <span>{{ t("call.hangup") }}</span>
        </button>
      </div>
    </div>

    <!-- 接听/拒绝（来电阶段） -->
    <div v-if="call.stage === 'incoming'" class="call-actions">
      <div class="action-item">
        <button type="button" class="big-ctrl decline" @click="decline">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
            />
          </svg>
        </button>
        <span class="action-label">{{ t("call.decline") }}</span>
      </div>
      <div class="action-item">
        <button type="button" class="big-ctrl accept" @click="accept">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
            />
          </svg>
        </button>
        <span class="action-label">{{ t("call.accept") }}</span>
      </div>
    </div>

    <!-- 通话中控制坞 -->
    <div
      v-if="
        call.stage === 'connected' ||
        call.stage === 'connecting' ||
        call.stage === 'failed'
      "
      class="call-dock"
    >
      <button
        type="button"
        class="dock-btn"
        :class="{ off: !call.audioOn }"
        @click="toggleAudio"
      >
        <svg v-if="call.audioOn" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"
          />
        </svg>
      </button>
      <button
        v-if="isVideo"
        type="button"
        class="dock-btn"
        :class="{ off: !call.videoOn }"
        @click="toggleVideo"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
          />
        </svg>
      </button>
      <button
        v-if="isVideo && call.videoOn"
        type="button"
        class="dock-btn"
        @click="switchCamera"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 11.5V13H9v2.5L5.5 12 9 8.5V11h6V8.5l3.5 3.5-3.5 3.5z"
          />
        </svg>
      </button>
      <button type="button" class="dock-btn hang" @click="hangup">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
          />
        </svg>
      </button>
    </div>

    <!-- 拨打等待中挂断 -->
    <div v-if="call.stage === 'outgoing'" class="call-actions">
      <div class="action-item">
        <button type="button" class="big-ctrl decline" @click="hangup">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
            />
          </svg>
        </button>
        <span class="action-label">{{ t("call.hangup") }}</span>
      </div>
    </div>

    <!-- 通话结束/取消状态（由 manager 自动返回上一页） -->
    <div v-if="call.stage === 'ended' || call.stage === 'rejected'" class="call-terminal">
      <div class="terminal-text">{{ stageText }}</div>
    </div>
  </div>
</template>

<style scoped lang="less">
.call-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #05060a;
}

.call-backdrop {
  position: absolute;
  inset: -60px;
  background-position: center;
  background-size: cover;
  filter: blur(48px) saturate(1.3);
  opacity: 0.32;
  transform: scale(1.15);
}

.call-scrim {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 20%,
    rgba(35, 39, 51, 0.55) 0%,
    rgba(11, 13, 18, 0.85) 60%,
    #05060a 100%
  );
}

.remote-video {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.call-stage {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 148px;
  height: 148px;

  img {
    width: 116px;
    height: 116px;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.22);
    border-radius: 50%;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  }

  .stage-ring {
    position: absolute;
    inset: 0;
    border: 1px solid rgba(52, 213, 112, 0.45);
    border-radius: 50%;
    opacity: 0;
    animation: ring-pulse 2.6s ease-out infinite;
  }

  .stage-ring.delay {
    animation-delay: 1.3s;
  }

  &.ringing {
    img {
      animation: avatar-breathe 2.6s ease-in-out infinite;
    }
  }
}

.local-preview {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 132px);
  right: 16px;
  z-index: 3;
  width: 104px;
  height: 142px;
  overflow: hidden;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
  }

  .local-badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
    padding: 1px 7px;
    font-size: 10px;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 999px;
    backdrop-filter: blur(6px);
  }

  .local-muted {
    position: absolute;
    right: 6px;
    bottom: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: #fff;
    background: #e64646;
    border-radius: 50%;

    svg {
      width: 12px;
      height: 12px;
    }
  }
}

.call-top {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 28px);
  left: 0;
  right: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.call-name {
  max-width: 70%;
  overflow: hidden;
  font-size: 21px;
  font-weight: 600;
  color: #fff;
  text-overflow: ellipsis;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
}

.call-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.call-type {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  backdrop-filter: blur(10px);

  svg {
    width: 12px;
    height: 12px;
  }
}

.call-stage-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);

  &.stage-timer {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #fff;
  }

  .timer-dot {
    width: 6px;
    height: 6px;
    background: #34d570;
    border-radius: 50%;
    animation: dot-blink 1.6s ease-in-out infinite;
  }
}

.call-actions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(env(safe-area-inset-bottom) + 44px);
  z-index: 5;
  display: flex;
  justify-content: center;
  gap: 64px;
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.action-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}

.big-ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  border: none;
  border-radius: 50%;
  transition: transform 0.2s ease;

  svg {
    width: 26px;
    height: 26px;
  }

  &:active {
    transform: scale(0.94);
  }
}

.big-ctrl.accept {
  background: linear-gradient(135deg, #34d570 0%, #0fbf5b 100%);
  box-shadow: 0 10px 26px rgba(15, 191, 91, 0.42);
}

.big-ctrl.decline {
  background: linear-gradient(135deg, #ff7875 0%, #e64646 100%);
  box-shadow: 0 10px 26px rgba(230, 70, 70, 0.42);
}

.call-dock {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom) + 32px);
  left: 50%;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  background: rgba(16, 18, 24, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(18px);
  transform: translateX(-50%);
}

.dock-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  transition: transform 0.18s ease, background 0.18s ease;

  svg {
    width: 24px;
    height: 24px;
  }

  &:active {
    transform: scale(0.94);
  }

  &.off {
    color: #1a1a1a;
    background: #fff;
  }

  &.hang {
    color: #fff;
    background: linear-gradient(135deg, #ff7875 0%, #e64646 100%);
    border: none;
    box-shadow: 0 8px 22px rgba(230, 70, 70, 0.42);
  }
}

.failed-panel {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(0, 0, 0, 0.55);

  .failed-text {
    font-size: 16px;
    color: #fff;
  }

  .failed-actions {
    display: flex;
    gap: 24px;
  }

  .ctrl-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: #fff;
    cursor: pointer;
    background: transparent;
    border: none;

    svg {
      box-sizing: border-box;
      width: 56px;
      height: 56px;
      padding: 14px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
    }

    span {
      font-size: 13px;
    }
  }

  .ctrl-btn.retry svg {
    background: var(--brand-blue, #3b82f6);
  }

  .ctrl-btn.hang svg {
    background: #e64646;
  }
}

.call-terminal {
  position: absolute;
  inset: 0;
  z-index: 7;
  display: flex;
  align-items: center;
  justify-content: center;

  .terminal-text {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.85);
  }
}

@keyframes ring-pulse {
  0% {
    opacity: 0.75;
    transform: scale(0.9);
  }

  70% {
    opacity: 0;
    transform: scale(1.22);
  }

  100% {
    opacity: 0;
    transform: scale(1.22);
  }
}

@keyframes avatar-breathe {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.04);
  }
}

@keyframes dot-blink {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
}
</style>
