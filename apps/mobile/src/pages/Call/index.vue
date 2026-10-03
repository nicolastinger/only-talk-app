<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallManager } from "@/webrtc/callManager";
import type { CallStage } from "@/webrtc/callManager";
import { useAvatar } from "@/hooks/useAvatar";
import { DEFAULT_AVATAR } from "@/stores/user";
import type { ChatSessionVo } from "@workspace/types";

const router = useRouter();
const { call, localStream, remoteStream, accept, decline, hangup, retry, toggleAudio, toggleVideo, switchCamera } = useCallManager();

const { getAvatarUrl } = useAvatar();

const friend = reactive({ name: "", icon: "", avatar: "" });
const loadingInfo = ref(false);

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRef = ref<HTMLVideoElement | null>(null);

const friendId = computed(() => call.friendId);

const isVideo = computed(() => call.media === "video");
const showRemoteVideo = computed(
  () =>
    call.stage === "connected" &&
    isVideo.value &&
    call.videoOn &&
    !!remoteStream.value
);
const showLocalPreview = computed(
  () => isVideo.value && call.videoOn && !!localStream.value && call.stage !== "idle"
);

const stageText = computed(() => {
  switch (call.stage) {
    case "outgoing":
      return "正在等待对方接听…";
    case "incoming":
      return isVideo.value ? "邀请你进行视频通话" : "邀请你进行语音通话";
    case "connecting":
      return "正在建立连接…";
    case "connected":
      return formatDuration(call.elapsedSec);
    case "ended":
      return call.errorMsg || "通话已结束";
    case "rejected":
      return call.errorMsg || "通话已取消";
    case "failed":
      return call.errorMsg || "连接失败";
    default:
      return "";
  }
});

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
});

watch(
  () => call.stage,
  async (stage: CallStage) => {
    if (stage === "connected") {
      await nextTick();
      bindStream(localVideoRef.value, localStream.value);
      bindStream(remoteVideoRef.value, remoteStream.value);
    }
  }
);

// 未登录/无活跃通话时不应停留在此页
onMounted(async () => {
  if (!call.active || !call.friendId) {
    router.replace("/chats");
    return;
  }
  await loadFriend();
});

onUnmounted(() => {
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
    <!-- 远端画面 -->
    <video
      v-show="showRemoteVideo"
      ref="remoteVideoRef"
      class="remote-video"
      autoplay
      playsinline
    ></video>

    <!-- 本地预览（视频通话小窗） -->
    <video
      v-show="showLocalPreview"
      ref="localVideoRef"
      class="local-video"
      autoplay
      playsinline
      muted
    ></video>

    <!-- 背景遮罩 -->
    <div class="call-bg"></div>

    <!-- 顶部信息 -->
    <div v-if="call.active && call.stage !== 'idle'" class="call-top">
      <img :src="coverAvatar" class="call-avatar" alt="" />
      <div class="call-name">{{ friend.name || friendId }}</div>
      <div
        class="call-stage-text"
        :class="{ 'stage-timer': call.stage === 'connected' }"
      >
        {{ stageText }}
      </div>
    </div>

    <!-- 失败提示条（仍在视频画面上） -->
    <div v-if="call.stage === 'failed'" class="failed-panel">
      <div class="failed-text">连接失败，请检查网络后重试</div>
      <div class="failed-actions">
        <button class="ctrl-btn retry" @click="retry">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
          <span>重试</span>
        </button>
        <button class="ctrl-btn hang" @click="hangup">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
            />
          </svg>
          <span>挂断</span>
        </button>
      </div>
    </div>

    <!-- 接听/拒绝 控制条（来电阶段） -->
    <div v-if="call.stage === 'incoming'" class="call-actions">
      <button class="big-ctrl decline" @click="decline">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
          />
        </svg>
        <span>拒绝</span>
      </button>
      <button class="big-ctrl accept" @click="accept">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
          />
        </svg>
        <span>接听</span>
      </button>
    </div>

    <!-- 通话中控制条 -->
    <div
      v-if="
        call.stage === 'connected' ||
        call.stage === 'connecting' ||
        call.stage === 'failed'
      "
      class="call-actions in-call"
    >
      <button
        class="big-ctrl neutral"
        :class="{ off: !call.audioOn }"
        @click="toggleAudio"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
          />
        </svg>
        <span>{{ call.audioOn ? "静音" : "静音开" }}</span>
      </button>
      <button
        v-if="isVideo"
        class="big-ctrl neutral"
        :class="{ off: !call.videoOn }"
        @click="toggleVideo"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
          />
        </svg>
        <span>{{ call.videoOn ? "关闭画面" : "开启画面" }}</span>
      </button>
      <button
        v-if="isVideo && call.videoOn"
        class="big-ctrl neutral"
        @click="switchCamera"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 11.5V13H9v2.5L5.5 12 9 8.5V11h6V8.5l3.5 3.5-3.5 3.5z"
          />
        </svg>
        <span>翻转</span>
      </button>
      <button class="big-ctrl hang" @click="hangup">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
          />
        </svg>
        <span>挂断</span>
      </button>
    </div>

    <!-- 等待阶段（拨打/未接通）挂断按钮 -->
    <div v-if="call.stage === 'outgoing'" class="call-actions">
      <button class="big-ctrl hang" @click="hangup">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
          />
        </svg>
        <span>挂断</span>
      </button>
    </div>

    <!-- 通话结束/取消 状态（由 manager 自动返回上一页） -->
    <div v-if="call.stage === 'ended' || call.stage === 'rejected'" class="call-terminal">
      <div class="terminal-text">{{ stageText }}</div>
    </div>
  </div>
</template>

<style scoped lang="less">
.call-page {
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.call-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 20%, #232733 0%, #0b0d12 60%, #000 100%);
  z-index: 0;
}
.remote-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  z-index: 1;
  background: #000;
}
.local-video {
  position: absolute;
  right: 16px;
  top: calc(env(safe-area-inset-top) + 88px);
  width: 110px;
  height: 150px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 3;
  transform: scaleX(-1);
}
.call-top {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(env(safe-area-inset-top) + 24px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 2;
  pointer-events: none;
}
.call-avatar {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.call-name {
  font-size: 19px;
  font-weight: 600;
  color: #fff;
}
.call-stage-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
  &.stage-timer {
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.9);
  }
}
.call-actions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(env(safe-area-inset-bottom) + 40px);
  display: flex;
  justify-content: center;
  gap: 28px;
  z-index: 4;
  &.in-call {
    gap: 22px;
  }
}
.big-ctrl {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 64px;
  padding: 8px 0 0;
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  svg {
    width: 30px;
    height: 30px;
  }
  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.9);
  }
}
.big-ctrl.accept,
.big-ctrl.hang {
  svg {
    width: 58px;
    height: 58px;
    padding: 13px;
    box-sizing: border-box;
    border-radius: 50%;
    background: #0fbf5b;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  }
}
.big-ctrl.hang svg {
  background: #e64646;
}
.big-ctrl.neutral svg {
  width: 52px;
  height: 52px;
  padding: 13px;
  box-sizing: border-box;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(4px);
}
.big-ctrl.neutral.off {
  opacity: 1;
  svg {
    background: rgba(255, 255, 255, 0.95);
    color: #1a1a1a;
  }
}
.failed-panel {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(0, 0, 0, 0.55);
  .failed-text {
    color: #fff;
    font-size: 16px;
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
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    svg {
      width: 56px;
      height: 56px;
      padding: 14px;
      box-sizing: border-box;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
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
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  .terminal-text {
    color: rgba(255, 255, 255, 0.85);
    font-size: 16px;
  }
}
</style>
