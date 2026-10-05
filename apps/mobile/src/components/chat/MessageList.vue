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
  MSG_TYPE_SYSTEM,
} from "@/chat/messageTypes";
import { getMessageDisplayText, isRecallMessage } from "@/chat/messageParse";
import { isMessageSelectable } from "@/chat/useMessageSelection";
import FileMsgItem from "./FileMsgItem.vue";
import ImageMsg from "./ImageMsg.vue";
import MsgTimeDivider from "./MsgTimeDivider.vue";
import PrivacyMsg from "./PrivacyMsg.vue";
import SystemMsg from "./SystemMsg.vue";

const props = defineProps<{
  mode: "single" | "group";
  messages: UiChatMessage[];
  myAvatar: string;
  /** 单聊=好友头像；群聊=群头像（成员头像缺省时的兜底） */
  peerAvatar: string;
  /** 单聊=好友昵称（撤回提示用） */
  peerName?: string;
  /** 群成员信息：uuid -> UserInfo */
  memberMap?: Record<string, UserInfo>;
  /** 群成员头像本地 url：uuid -> url|null */
  avatarUrlMap?: Record<string, string | null>;
  /** 头像加载失败兜底值 */
  fallbackAvatar?: string;
  /** 当前登录用户 uuid（用于点击自己的头像跳转资料卡） */
  myUuid?: string;
  /** 多选模式 */
  selectMode?: boolean;
  /** 多选模式已选中的 nano_id 列表 */
  selectedIds?: string[];
}>();

const emit = defineEmits<{
  (e: "preview", msg: UiChatMessage): void;
  (e: "retry", msg: UiChatMessage): void;
  (e: "avatar-click", payload: { uuid: string; isMine: boolean }): void;
  (e: "long-press", msg: UiChatMessage): void;
  (e: "toggle-select", msg: UiChatMessage): void;
}>();

const selectedIds = computed(() => props.selectedIds || []);
const selectMode = computed(() => !!props.selectMode);
const isSelected = (msg: UiChatMessage): boolean =>
  selectedIds.value.includes(msg.textMsg.nano_id);
const selectable = (msg: UiChatMessage): boolean => isMessageSelectable(msg);

/* ===== 长按进入多选 ===== */
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let suppressClickUntil = 0;

const clearPress = () => {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
};

const onTouchStart = (msg: UiChatMessage) => {
  if (selectMode.value || !selectable(msg)) return;
  clearPress();
  pressTimer = setTimeout(() => {
    pressTimer = null;
    suppressClickUntil = Date.now() + 400;
    if (navigator.vibrate) navigator.vibrate(15);
    emit("long-press", msg);
  }, 500);
};

const onTouchMove = () => clearPress();
const onTouchEnd = () => clearPress();

const onRowClick = (e: MouseEvent, msg: UiChatMessage) => {
  if (selectMode.value) {
    e.stopPropagation();
    e.preventDefault();
    emit("toggle-select", msg);
    return;
  }
  if (Date.now() < suppressClickUntil) {
    e.stopPropagation();
    e.preventDefault();
  }
};

/** 点击头像：自己的消息用当前用户 uuid，对方的用消息发送者 uuid */
const onAvatarClick = (msg: UiChatMessage, isMine: boolean) => {
  const uuid = isMine
    ? props.myUuid || ""
    : msg.senderUuid || msg.textMsg.send_user || "";
  if (!uuid) return;
  emit("avatar-click", { uuid, isMine });
};

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
): "text" | "image" | "file" | "privacy" => {
  if (textType === MSG_TYPE_IMAGE || textType === MSG_TYPE_GROUP_IMAGE)
    return "image";
  if (textType === MSG_TYPE_GROUP_FILE) return "file";
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

/** 撤回控制消息（居中提示，不渲染气泡） */
const isRecallRow = (msg: UiChatMessage): boolean =>
  isRecallMessage(msg.textMsg.text_type, msg.textMsg.raw);

/** 撤回提示文案：我/群成员昵称/对方 + 撤回了一条消息 */
const recallText = (msg: UiChatMessage): string => {
  if (msg.from === "mine") return "你撤回了一条消息";
  if (isGroup.value) return `${senderName(msg)}撤回了一条消息`;
  return `${props.peerName || "对方"}撤回了一条消息`;
};

const senderUserType = (msg: UiChatMessage): number | undefined => {
  const info = props.memberMap?.[msg.senderUuid || msg.textMsg.send_user || ""];
  return info?.user_type ?? undefined;
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

      <!-- 撤回提示 居中灰条 -->
      <div v-if="isRecallRow(msg)" class="row-recall">
        <span class="recall-text">{{ recallText(msg) }}</span>
      </div>

      <!-- 系统/群通知 居中灰条 -->
      <div v-else-if="isSystemRow(msg)" class="row-system">
        <SystemMsg :raw="msg.textMsg.raw" />
      </div>

      <!-- 我的消息 -->
      <div
        v-else-if="msg.from === 'mine'"
        class="row row-mine"
        :class="{ selected: selectMode && isSelected(msg) }"
        @touchstart="onTouchStart(msg)"
        @touchend="onTouchEnd"
        @touchmove="onTouchMove"
        @touchcancel="onTouchEnd"
        @click.capture="onRowClick($event, msg)"
      >
        <span
          v-if="selectMode && selectable(msg)"
          class="select-mark"
          :class="{ checked: isSelected(msg) }"
        />
        <img
          :src="myAvatar || fallbackAvatar"
          class="avatar"
          alt="avatar"
          @click="onAvatarClick(msg, true)"
          @error="
            ($event.target as HTMLImageElement).src = fallbackAvatar || ''
          "
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

          <!-- P2P 隐私 -->
          <template
            v-else-if="contentKind(msg.textMsg.text_type) === 'privacy'"
          >
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
            v-else-if="
              msg.ack === false && !msg.sendingImage && !msg.sendingFile
            "
            class="ack-label pending"
            >发送中</span
          >
        </div>
      </div>

      <!-- 对方消息 -->
      <div
        v-else
        class="row row-friend"
        :class="{ selected: selectMode && isSelected(msg) }"
        @touchstart="onTouchStart(msg)"
        @touchend="onTouchEnd"
        @touchmove="onTouchMove"
        @touchcancel="onTouchEnd"
        @click.capture="onRowClick($event, msg)"
      >
        <span
          v-if="selectMode && selectable(msg)"
          class="select-mark"
          :class="{ checked: isSelected(msg) }"
        />
        <img
          :src="senderAvatar(msg)"
          class="avatar"
          alt="avatar"
          @click="onAvatarClick(msg, false)"
          @error="($event.target as HTMLImageElement).src = peerAvatar"
        />
        <div class="row-content">
          <div v-if="isGroup" class="sender-name">
            {{ senderName(msg) }}
            <UserTypeTag :type="senderUserType(msg)" />
          </div>
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
          <template
            v-else-if="contentKind(msg.textMsg.text_type) === 'privacy'"
          >
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
.row-recall {
  display: flex;
  justify-content: center;
  padding: 4px 0;
  .recall-text {
    font-size: 12px;
    color: var(--text-placeholder);
    text-align: center;
    padding: 3px 10px;
  }
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: transform var(--transition-fast);
  &:active {
    transform: scale(0.92);
  }
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

/* ===== 多选 ===== */
.select-mark {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border-medium);
  background: var(--surface);
  flex-shrink: 0;
  align-self: center;
  box-sizing: border-box;
  &.checked {
    border-color: var(--brand-blue);
    background: var(--brand-blue);
    box-shadow: inset 0 0 0 3px var(--surface);
  }
}
.row.selected {
  background: var(--surface-hover);
  border-radius: 10px;
}
</style>
