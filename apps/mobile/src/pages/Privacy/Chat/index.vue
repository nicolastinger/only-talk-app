<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "vant";
import { get_user_info_with_cache } from "@workspace/services";
import type { UserInfo, VideoCallInvite } from "@workspace/types";
import MessageInputBar from "@/components/chat/MessageInputBar.vue";
import PrivacyVideoCall from "@/components/privacy/PrivacyVideoCall.vue";
import { useAvatar } from "@/hooks/useAvatar";
import { useBackendEvent } from "@/hooks/useBackendEvent";
import { useI18n } from "@/i18n";
import { detectPrivacyMediaCapabilities } from "@/privacy/media/capabilities";
import * as transport from "@/privacy/media/p2pTransport";
import { getMyUuid } from "@/utils/api";
import { attachViewportHeight } from "@/utils/viewport";
import { DEFAULT_AVATAR } from "@/stores/user";

interface PrivacyMessage {
  id: string;
  text: string;
  mine: boolean;
  ts: number;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { getAvatarUrl } = useAvatar();

const friendId = String(route.params.friendId || "");
const peer = ref<UserInfo | null>(null);
const peerAvatar = ref(DEFAULT_AVATAR);
const inputText = ref("");
const messages = ref<PrivacyMessage[]>([]);
const pageRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

// ==================== 隐私音视频 ====================
const mediaSupportPromise = detectPrivacyMediaCapabilities();
const mediaSupported = ref<boolean | null>(null);
const callActive = ref(false);
const callInitiator = ref(true);
const callInvite = ref<VideoCallInvite | null>(null);
const incomingCall = ref<VideoCallInvite | null>(null);

let meUuid = "";
let viewportCleanup: (() => void) | undefined;
let closed = false;

const friendName = computed(
  () => peer.value?.username || friendId || t("privacyChat.other")
);
const headerHint = computed(() =>
  mediaSupported.value === false
    ? `${t("privacyChat.hint")} · ${t("privacyChat.textOnly")}`
    : t("privacyChat.hint")
);

void mediaSupportPromise.then((caps) => {
  mediaSupported.value = caps.supported;
  if (!caps.supported) {
    console.info("[PrivacyChat] 音视频不可用, 仅文字聊天:", caps.reason);
  }
});

const scrollToBottom = async () => {
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
};

const loadPeer = async () => {
  try {
    const result = await get_user_info_with_cache(friendId);
    peer.value = result.user_info;
    const url = await getAvatarUrl(result.user_info?.icon);
    if (url) peerAvatar.value = url;
  } catch {
    // 忽略：标题回退显示 uuid
  }
};

useBackendEvent("p2p_text_message", (payload) => {
  try {
    const msg = JSON.parse(payload) as {
      type?: string;
      send_user?: string;
      text?: string;
      timestamp?: number;
    };
    if (!msg.text) return;
    messages.value.push({
      id: `${Date.now()}_${Math.random()}`,
      text: msg.text,
      mine: !!meUuid && msg.send_user === meUuid,
      ts: msg.timestamp || Date.now(),
    });
    void scrollToBottom();
  } catch (e) {
    console.error("[PrivacyChat] 解析 P2P 文本失败:", e);
  }
});

/* ==================== 隐私音视频 ==================== */

const startVideoCall = () => {
  if (!mediaSupported.value) {
    showToast(t("privacyChat.videoUnsupported"));
    return;
  }
  if (callActive.value) return;
  callInitiator.value = true;
  callInvite.value = null;
  callActive.value = true;
};

const acceptIncomingCall = () => {
  if (!incomingCall.value) return;
  callInvite.value = incomingCall.value;
  incomingCall.value = null;
  callInitiator.value = false;
  callActive.value = true;
};

const rejectIncomingCall = () => {
  if (!incomingCall.value) return;
  incomingCall.value = null;
  void transport
    .sendP2pVideoCallResponse(friendId, {
      accept: false,
      mediaConfig: null,
      rejectReason: t("privacyChat.userRejected"),
    })
    .catch(() => {});
};

const onCallClosed = () => {
  callActive.value = false;
  callInvite.value = null;
  callInitiator.value = true;
};

// 隐私会话内的视频通话邀请（普通 WebRTC 通话由 callManager 处理，不走这里）
useBackendEvent("video_call_invite", async (payload) => {
  let invite: VideoCallInvite;
  try {
    invite = JSON.parse(payload) as VideoCallInvite;
  } catch {
    return;
  }
  if (invite.from_uuid && invite.from_uuid !== friendId) return;

  const caps = await mediaSupportPromise;
  mediaSupported.value = caps.supported;

  if (!caps.supported) {
    // 编解码不支持：自动拒绝音视频，只保留文字聊天
    void transport
      .sendP2pVideoCallResponse(friendId, {
        accept: false,
        mediaConfig: null,
        rejectReason: t("privacyChat.videoUnsupported"),
      })
      .catch(() => {});
    showToast(t("privacyChat.videoUnsupported"));
    return;
  }

  if (callActive.value) {
    void transport
      .sendP2pVideoCallResponse(friendId, {
        accept: false,
        mediaConfig: null,
        rejectReason: t("privacyChat.busy"),
      })
      .catch(() => {});
    return;
  }

  incomingCall.value = invite;
});

// 主叫在接听前挂断时，关闭来电弹窗
useBackendEvent("video_call_end", (payload) => {
  if (payload && payload !== friendId) return;
  if (incomingCall.value) {
    incomingCall.value = null;
    showToast(t("privacyChat.callEnded"));
  }
});

const sendText = async (text: string) => {
  const value = text.trim();
  if (!value) return;
  try {
    await invoke("send_p2p_text_msg", { text: value, targetUuid: friendId });
    messages.value.push({
      id: `${Date.now()}_${Math.random()}`,
      text: value,
      mine: true,
      ts: Date.now(),
    });
    inputText.value = "";
    void scrollToBottom();
  } catch (e) {
    console.error("[PrivacyChat] 发送失败:", e);
    showToast(t("privacyChat.errors.sendFailed"));
  }
};

/** 离开页面即结束本次隐私会话（消息仅存内存，关闭后消失） */
const closeConnection = () => {
  if (closed) return;
  closed = true;
  invoke("close_p2p_connection", { targetUuid: friendId }).catch(() => {});
};

const exit = () => {
  closeConnection();
  router.replace(`/chats/chat/${encodeURIComponent(friendId)}`);
};

onMounted(async () => {
  meUuid = (await getMyUuid().catch(() => "")) || "";
  await loadPeer();
  viewportCleanup = attachViewportHeight(() => pageRef.value, scrollToBottom);
  void scrollToBottom();
});

onUnmounted(() => {
  viewportCleanup?.();
  closeConnection();
});
</script>

<template>
  <div ref="pageRef" class="privacy-page">
    <div class="header">
      <button class="back-btn" type="button" :aria-label="t('privacyChat.title')" @click="exit">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <div class="header-main">
        <div class="header-title">
          <svg class="lock-icon" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
            />
          </svg>
          <span class="header-name">{{ friendName }}</span>
        </div>
        <div class="header-hint">{{ headerHint }}</div>
      </div>
      <button
        v-if="mediaSupported"
        class="header-video"
        type="button"
        :aria-label="t('privacyChat.videoCall')"
        @click="startVideoCall"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
          />
        </svg>
      </button>
      <img
        :src="peerAvatar"
        class="header-avatar"
        :alt="friendName"
        @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
      />
    </div>

    <div ref="listRef" class="message-list">
      <div v-if="messages.length === 0" class="empty">
        <svg viewBox="0 0 24 24" fill="currentColor" class="empty-icon">
          <path
            d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 15.5l-3.54-3.54 1.41-1.41L11 13.67l5.13-5.13 1.41 1.41L11 16.5z"
          />
        </svg>
        <span>{{ t("privacyChat.noMessages") }}</span>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-row"
        :class="{ mine: msg.mine }"
      >
        <div class="bubble">{{ msg.text }}</div>
      </div>
    </div>

    <MessageInputBar
      v-model="inputText"
      :tools="['emoji']"
      :placeholder="t('privacyChat.inputPlaceholder')"
      @send="sendText"
    />

    <div v-if="incomingCall" class="incoming-call-overlay">
      <div class="incoming-call-card">
        <img
          class="incoming-avatar"
          :src="peerAvatar"
          :alt="friendName"
          @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
        />
        <div class="incoming-name">
          {{ incomingCall.from_name || friendName }}
        </div>
        <div class="incoming-desc">
          {{ t("privacyChat.incomingVideoCall") }}
        </div>
        <div class="incoming-actions">
          <button class="incoming-btn reject" type="button" @click="rejectIncomingCall">
            {{ t("privacyChat.reject") }}
          </button>
          <button class="incoming-btn accept" type="button" @click="acceptIncomingCall">
            {{ t("privacyChat.accept") }}
          </button>
        </div>
      </div>
    </div>

    <PrivacyVideoCall
      v-if="callActive"
      :friend-id="friendId"
      :is-initiator="callInitiator"
      :friend-name="friendName"
      :friend-avatar="peerAvatar"
      :invite="callInvite"
      @close="onCallClosed"
    />
  </div>
</template>

<style scoped lang="less">
.privacy-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--page-bg);
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  z-index: 50;
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;

  svg {
    width: 20px;
    height: 20px;
  }

  &:active {
    background: var(--surface-hover);
  }
}

.header-main {
  flex: 1;
  min-width: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.lock-icon {
  width: 18px;
  height: 18px;
  color: var(--brand-blue);
  flex-shrink: 0;
}

.header-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-hint {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;
}

.header-video {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  background: var(--surface);
  color: var(--brand-blue);
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  svg {
    width: 18px;
    height: 18px;
  }

  &:active {
    background: var(--surface-hover);
  }
}

.incoming-call-overlay {
  position: fixed;
  inset: 0;
  z-index: 3250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10, 18, 32, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.incoming-call-card {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 22px 20px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-lg, 0 12px 40px rgba(15, 35, 75, 0.18));
}

.incoming-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-sm);
}

.incoming-name {
  margin-top: 12px;
  max-width: 100%;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.incoming-desc {
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}

.incoming-actions {
  width: 100%;
  display: flex;
  gap: 12px;
  margin-top: 22px;
}

.incoming-btn {
  flex: 1;
  height: 42px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &.reject {
    background: var(--surface-alt);
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
  }

  &.accept {
    background: var(--gradient-primary);
    color: #fff;
    box-shadow: var(--shadow-sm);
  }
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  -webkit-overflow-scrolling: touch;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.empty-icon {
  width: 34px;
  height: 34px;
  color: var(--brand-blue);
  opacity: 0.7;
}

.message-row {
  display: flex;
  justify-content: flex-start;

  &.mine {
    justify-content: flex-end;
  }
}

.bubble {
  max-width: 76%;
  padding: 9px 13px;
  border-radius: 14px;
  font-size: 15px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--surface);
  color: var(--text-primary);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);

  .message-row.mine & {
    background: var(--gradient-primary);
    color: #fff;
    border-color: transparent;
  }
}
</style>
