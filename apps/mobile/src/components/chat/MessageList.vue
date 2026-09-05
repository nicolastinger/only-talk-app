<script setup lang="ts">
import { computed } from "vue";
import type { UserInfo } from "@workspace/types";
import type { UiChatMessage } from "@/chat/types";
import {
  MSG_TYPE_FILE,
  MSG_TYPE_GROUP_FILE,
  MSG_TYPE_GROUP_IMAGE,
  MSG_TYPE_GROUP_NOTIFICATION,
  MSG_TYPE_IMAGE,
  MSG_TYPE_P2P,
  MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
  MSG_TYPE_P2P_VIDEO_CALL_END,
  MSG_TYPE_P2P_VIDEO_CALL_INVITE,
  MSG_TYPE_P2P_VIDEO_CALL_REJECT,
  MSG_TYPE_SYSTEM,
  MSG_TYPE_WEBRTC_SIGNAL,
} from "@/chat/messageTypes";
import { getMessageDisplayText } from "@/chat/messageParse";
import FileMsgItem from "./FileMsgItem.vue";
import ImageMsg from "./ImageMsg.vue";
import MsgTimeDivider from "./MsgTimeDivider.vue";
import PrivacyMsg from "./PrivacyMsg.vue";
import SystemMsg from "./SystemMsg.vue";
import WebRtcMsg from "./WebRtcMsg.vue";

const props = defineProps<{
  mode: "single" | "group";
  messages: UiChatMessage[];
  myAvatar: string;
  /** 单聊=好友头像；群聊=群头像（成员头像缺省时的兜底） */
  peerAvatar: string;
  /** 群成员信息：uuid -> UserInfo */
  memberMap?: Record<string, UserInfo>;
  /** 群成员头像本地 url：uuid -> url|null */
  avatarUrlMap?: Record<string, string | null>;
  /** 头像加载失败兜底值 */
  fallbackAvatar?: string;
}>();

const emit = defineEmits<{
  (e: "preview", msg: UiChatMessage): void;
  (e: "retry", msg: UiChatMessage): void;
}>();

const isGroup = computed(() => props.mode === "group");

const isSystemRow = (msg: UiChatMessage): boolean => {
  if (msg.from === "system") return true;
  if (msg.textMsg.send_user === "system") return true;
  if (
    msg.textMsg.text_type === MSG_TYPE_GROUP_NOTIFICATION ||
    msg.textMsg.text_type === MSG_TYPE_SYSTEM
  )
    return true;
  return false;
};

/** 内容类型分发（对齐 PC MineChatBox/CustomerChatBox renderMessage） */
const contentKind = (
  textType: number
): "text" | "image" | "file" | "webrtc" | "privacy" => {
  if (textType === MSG_TYPE_IMAGE || textType === MSG_TYPE_GROUP_IMAGE)
    return "image";
  if (textType === MSG_TYPE_GROUP_FILE) return "file";
  if (
    [
      MSG_TYPE_P2P_VIDEO_CALL_INVITE,
      MSG_TYPE_P2P_VIDEO_CALL_ACCEPT,
      MSG_TYPE_P2P_VIDEO_CALL_REJECT,
      MSG_TYPE_P2P_VIDEO_CALL_END,
      MSG_TYPE_WEBRTC_SIGNAL,
    ].includes(textType)
  )
    return "webrtc";
  if (textType === MSG_TYPE_P2P) return "privacy";
  return "text";
};

/** 单聊文件(3)/群文件(2003) 统一走文件卡片 */
const isFileMsg = (textType: number): boolean =>
  textType === MSG_TYPE_FILE || textType === MSG_TYPE_GROUP_FILE;

const fallbackText = (msg: UiChatMessage): string =>
  getMessageDisplayText(msg.textMsg.text_type, msg.textMsg.raw);

/** 自己的消息且非发送中/失败 → 视为已送达，显示绿点
 *  ack === true 实时确认；ack === undefined 历史记录（已落库即成功送达） */
const showSentDot = (msg: UiChatMessage): boolean =>
  msg.from === "mine" && !msg.failed && msg.ack !== false;

const senderName = (msg: UiChatMessage): string => {
  if (msg.senderName) return msg.senderName;
  const info = props.memberMap?.[msg.senderUuid || msg.textMsg.send_user || ""];
  const username = info?.username || "";
  if (username) return username;
  return msg.textMsg.send_user ? msg.textMsg.send_user.slice(0, 8) : "群成员";
};

const senderAvatar = (msg: UiChatMessage): string => {
  const uuid = msg.senderUuid || msg.textMsg.send_user || "";
  const url = props.avatarUrlMap?.[uuid];
  if (url) return url;
  return props.peerAvatar;
};
</script>

<template>
  <div class="msg-list">
    <template v-for="msg in messages" :key="msg.textMsg.nano_id">
      <MsgTimeDivider v-if="msg.showTime" :timestamp="msg.textMsg.timestamp" />

      <!-- 系统/群通知 居中灰条 -->
      <div v-if="isSystemRow(msg)" class="row-system">
        <SystemMsg :raw="msg.textMsg.raw" />
      </div>

      <!-- 我的消息 -->
      <div v-else-if="msg.from === 'mine'" class="row row-mine">
        <img
          :src="myAvatar || fallbackAvatar"
          class="avatar"
          alt="avatar"
          @error="($event.target as HTMLImageElement).src = fallbackAvatar || ''"
        />
        <div class="row-content" :class="{ failed: msg.failed }">
          <!-- 图片消息 -->
          <template v-if="contentKind(msg.textMsg.text_type) === 'image'">
            <div class="media-box">
              <ImageMsg
                :src="msg.imageUrl"
                :loading="!msg.imageUrl"
                @preview="emit('preview', msg)"
              />
              <span v-if="showSentDot(msg)" class="sent-dot" />
            </div>
          </template>

          <!-- 文件消息 -->
          <template v-else-if="isFileMsg(msg.textMsg.text_type)">
            <div
              class="file-bubble mine-file"
              :class="showSentDot(msg) ? 'has-dot' : ''"
            >
              <FileMsgItem :msg="msg" />
              <span v-if="showSentDot(msg)" class="sent-dot" />
            </div>
          </template>

          <!-- 通话卡片 -->
          <template v-else-if="contentKind(msg.textMsg.text_type) === 'webrtc'">
            <WebRtcMsg
              :text-type="msg.textMsg.text_type"
              :is-mine="true"
              :raw="msg.textMsg.raw"
            />
          </template>

          <!-- P2P 隐私 -->
          <template v-else-if="contentKind(msg.textMsg.text_type) === 'privacy'">
            <PrivacyMsg :is-mine="true" />
          </template>

          <!-- 文本气泡 -->
          <template v-else>
            <div class="bubble bubble-mine">
              <span class="text-inner">{{ fallbackText(msg) }}</span>
              <span v-if="showSentDot(msg)" class="sent-dot" />
            </div>
          </template>

          <!-- 状态行 -->
          <div
            v-if="msg.failed"
            class="status-line"
            @click="emit('retry', msg)"
          >
            <span class="fail-mark">!</span>
            <span>发送失败，点击重发</span>
          </div>
          <span
            v-else-if="msg.ack === false && !msg.sendingImage"
            class="ack-label pending"
            >发送中</span
          >
        </div>
      </div>

      <!-- 对方消息 -->
      <div v-else class="row row-friend">
        <img
          :src="senderAvatar(msg)"
          class="avatar"
          alt="avatar"
          @error="($event.target as HTMLImageElement).src = peerAvatar"
        />
        <div class="row-content">
          <div v-if="isGroup" class="sender-name">{{ senderName(msg) }}</div>
          <template v-if="contentKind(msg.textMsg.text_type) === 'image'">
            <ImageMsg
              :src="msg.imageUrl"
              :loading="!msg.imageUrl"
              @preview="emit('preview', msg)"
            />
          </template>
          <template v-else-if="isFileMsg(msg.textMsg.text_type)">
            <div class="file-bubble friend-file">
              <FileMsgItem :msg="msg" />
            </div>
          </template>
          <template v-else-if="contentKind(msg.textMsg.text_type) === 'webrtc'">
            <WebRtcMsg
              :text-type="msg.textMsg.text_type"
              :is-mine="false"
              :raw="msg.textMsg.raw"
            />
          </template>
          <template v-else-if="contentKind(msg.textMsg.text_type) === 'privacy'">
            <PrivacyMsg :is-mine="false" />
          </template>
          <template v-else>
            <div class="bubble bubble-friend">
              <span class="text-inner">{{ fallbackText(msg) }}</span>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="less">
.msg-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 4px;
}
.row-mine {
  flex-direction: row-reverse;
}
.row-friend {
  flex-direction: row;
}
.row-system {
  display: flex;
  justify-content: center;
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}
.row-content {
  max-width: calc(100% - 48px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}
.row-mine .row-content {
  align-items: flex-end;
}
.sender-name {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 2px;
  margin-left: 4px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 气泡 ===== */
.bubble {
  padding: 10px 14px;
  border-radius: 18px;
  word-break: break-word;
  font-size: 15px;
  position: relative;
  max-width: 100%;
}
.text-inner {
  white-space: pre-wrap;
  line-height: 1.5;
}
.bubble-friend {
  background: var(--surface);
  border-bottom-left-radius: 6px;
  box-shadow: var(--shadow-xs);
  border: 1px solid var(--border-light);
  color: var(--text-primary);
}
.bubble-mine {
  background: var(--gradient-primary);
  border-bottom-right-radius: 6px;
  box-shadow: var(--shadow-sm);
  color: #fff;
}

.file-bubble {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);
  background: var(--surface);
}

/* 媒体消息包裹层（用于定位绿点） */
.media-box {
  position: relative;
  border-radius: 10px;
}

/* 已发送绿点（对齐 PC MineChatBox.sentBadge） */
.sent-dot {
  position: absolute;
  bottom: 5px;
  right: 7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #52c41a;
  box-shadow: 0 0 3px rgba(82, 196, 26, 0.5);
  pointer-events: none;
}
.bubble-mine {
  padding-right: 16px;
}
.file-bubble.has-dot {
  padding-right: 4px;
}

/* ===== 状态行 ===== */
.status-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  color: #ef4444;
  cursor: pointer;
  .fail-mark {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ef4444;
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
  }
}
.ack-label {
  font-size: 11px;
  margin-top: 2px;
  line-height: 1;
}
.ack-label.pending {
  color: var(--text-placeholder);
}
</style>
