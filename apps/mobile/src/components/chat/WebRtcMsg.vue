<script setup lang="ts">
import { computed } from "vue";
import { parseSignalRecord } from "@/chat/messageParse";
import {
  MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
  MSG_TYPE_P2P_VIDEO_CALL_END,
  MSG_TYPE_P2P_VIDEO_CALL_INVITE,
  MSG_TYPE_P2P_VIDEO_CALL_REJECT,
} from "@/chat/messageTypes";

/**
 * 通话/WebRTC 状态气泡（对齐 PC WebRTCMessage）：
 *  - 12/13/14/15 控制消息：invite/accept/reject/end
 *  - 100 信令摘要：offer/answer/candidate/end
 */
const props = defineProps<{
  textType: number;
  isMine: boolean;
  raw: string;
}>();

const signal = computed(() => parseSignalRecord(props.raw));

interface Step {
  label: string;
}

const getStep = (): Step => {
  const type = signal.value?.type || "";
  switch (type) {
    case "invite":
      return { label: props.isMine ? "我发起了视频通话" : "对方发起了视频通话" };
    case "accept":
      return { label: "通话已接通" };
    case "reject":
      return { label: "通话已拒绝" };
    case "end":
      return { label: "通话已结束" };
    case "offer":
      return { label: props.isMine ? "我发起了视频通话" : "对方发起了视频通话" };
    case "answer":
      return { label: "通话已接通" };
    case "candidate":
      return { label: "正在建立连接..." };
    default:
      return { label: "通话记录" };
  }
};

const title = computed(() => getStep().label);

const sessionText = computed(() => {
  const id = signal.value?.sessionId;
  return id ? `会话: ${id.slice(0, 8)}` : "";
});

const isControl = computed(() =>
  [
    MSG_TYPE_P2P_VIDEO_CALL_INVITE,
    MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
    MSG_TYPE_P2P_VIDEO_CALL_REJECT,
    MSG_TYPE_P2P_VIDEO_CALL_END,
  ].includes(props.textType)
);
</script>

<template>
  <div class="webrtc-card" :class="{ mine: isMine, control: isControl }">
    <svg viewBox="0 0 24 24" fill="currentColor" class="webrtc-icon">
      <path
        d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
      />
    </svg>
    <div class="webrtc-text">
      <div class="webrtc-title">{{ title }}</div>
      <div v-if="sessionText" class="webrtc-session">{{ sessionText }}</div>
    </div>
  </div>
</template>

<style scoped lang="less">
.webrtc-card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 12px;
  background: var(--surface-alt);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);
  max-width: 240px;
}
.webrtc-icon {
  width: 22px;
  height: 22px;
  color: var(--brand-blue);
  flex-shrink: 0;
}
.webrtc-text {
  min-width: 0;
}
.webrtc-title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
}
.webrtc-session {
  font-size: 11px;
  color: var(--text-placeholder);
  margin-top: 2px;
}
</style>
