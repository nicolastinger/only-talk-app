<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { showToast, showLoadingToast, closeToast } from "vant";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useMessageApi } from "@/hooks/useMessageApi";
import { useAvatar } from "@/hooks/useAvatar";
import { getMyUuid } from "@/utils/api";
import { formatMessageTime } from "@/utils/time";
import {
  getChatFileByBizId,
  selectFile,
  convertPathToTauriUrl,
} from "@workspace/services";
import { DEFAULT_AVATAR } from "@/stores/user";
import { useUserStore } from "@/stores/user";
import type { TextQuicMsgVo, ChatSessionVo } from "@workspace/types";

const route = useRoute();
const router = useRouter();
const friendId = route.params.friendId as string;

interface ChatMessage {
  from: "mine" | "friend" | "system";
  textMsg: TextQuicMsgVo;
  ack: boolean | undefined;
  showTime: boolean;
  imageUrl?: string | null;
  sendingImage?: boolean;
}

const messages = ref<ChatMessage[]>([]);
const inputText = ref("");
const loading = ref(true);
const loadingMore = ref(false);
const currentPage = ref(1);
const hasMore = ref(true);
const pageSize = 20;
const friendInfo = reactive({ name: "", icon: "" });
const containerRef = ref<HTMLElement | null>(null);
const chatPageRef = ref<HTMLElement | null>(null);
const meUuid = ref("");

const { textMessage } = useMessageApi(() => meUuid.value, friendId);
const { getAvatarUrl } = useAvatar();
const { userInfo } = useUserStore();

const chatAvatar = ref<string | null>(null);
const myAvatar = ref<string | null>(null);

const imageCache = new Map<string, string>();

const loadAvatars = async () => {
  if (userInfo.value?.icon) {
    const url = await getAvatarUrl(userInfo.value.icon);
    if (url) myAvatar.value = url;
  }
  if (friendInfo.icon) {
    const url = await getAvatarUrl(friendInfo.icon);
    if (url) chatAvatar.value = url;
  }
};

const loadFriendInfo = async () => {
  try {
    const sessions: ChatSessionVo[] = await invoke(
      "get_chat_session_from_store"
    );
    const session = sessions.find(
      (s) => s.send_user === friendId || s.recv_user === friendId
    );
    if (session) {
      friendInfo.name = session.friend_name || friendId;
      friendInfo.icon = session.friend_icon || "";
    } else {
      friendInfo.name = friendId;
    }
  } catch {
    friendInfo.name = friendId;
  }
};

const loadImageMessage = async (msg: TextQuicMsgVo): Promise<string | null> => {
  try {
    const parsed = JSON.parse(msg.raw);
    const bizId = parsed.biz_id;
    if (!bizId) return null;
    if (imageCache.has(bizId)) return imageCache.get(bizId)!;
    const files = await getChatFileByBizId(bizId, msg.nano_id);
    if (files && files.length > 0) {
      const url = files[0].tauri_file_path;
      if (url) {
        imageCache.set(bizId, url);
        return url;
      }
    }
    return null;
  } catch {
    return null;
  }
};

const loadMessages = async (page: number = 1, prepend: boolean = false) => {
  if (page === 1) loading.value = true;
  else loadingMore.value = true;
  try {
    const textQuicMsg = {
      nano_id: "",
      raw: "",
      recv_user: meUuid.value,
      send_user: friendId,
      text_type: 0,
      timestamp: 0,
    };
    const data: TextQuicMsgVo[] = await invoke("get_chat_record_from_store", {
      textQuicMsg,
      page: { size: pageSize, current: page, total: 0 },
    });
    if (data.length < pageSize) hasMore.value = false;

    const chatMessages: ChatMessage[] = await Promise.all(
      data
        .filter((m) => m.text_type !== 201)
        .map(async (item, index, arr) => {
          const msg: ChatMessage = {
            from: (item.send_user === meUuid.value
              ? "mine"
              : item.send_user === "system"
              ? "system"
              : "friend") as ChatMessage["from"],
            textMsg: item,
            ack: undefined,
            showTime:
              index === 0 ||
              item.timestamp - arr[index - 1].timestamp > 10 * 60 * 1000,
          };
          if (item.text_type === 2) {
            msg.imageUrl = await loadImageMessage(item);
          }
          return msg;
        })
    );

    if (prepend) messages.value = [...chatMessages, ...messages.value];
    else {
      messages.value = chatMessages;
      currentPage.value = 1;
      await nextTick();
      scrollToBottom(false);
    }
  } catch (e) {
    console.error("加载消息失败:", e);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const onScroll = () => {
  const el = containerRef.value;
  if (!el || loadingMore.value || !hasMore.value) return;
  if (el.scrollTop <= 80) {
    const nextPage = currentPage.value + 1;
    currentPage.value = nextPage;
    loadMessages(nextPage, true);
  }
};

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text) return;
  const nanoId = [...Array(21)]
    .map(
      () =>
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"[
          Math.floor(Math.random() * 64)
        ]
    )
    .join("");
  const textMsg: TextQuicMsgVo = {
    nano_id: nanoId,
    text_type: 1,
    raw: JSON.stringify({ text, prev_id: "", platform: 0 }),
    recv_user: friendId,
    send_user: "",
    timestamp: Date.now(),
  };
  const tempMsg: ChatMessage = {
    from: "mine",
    textMsg,
    ack: false,
    showTime:
      messages.value.length === 0 ||
      Date.now() - messages.value[messages.value.length - 1].textMsg.timestamp >
        10 * 60 * 1000,
  };
  messages.value.push(tempMsg);
  inputText.value = "";
  await nextTick();
  scrollToBottom(true);
  try {
    await invoke("send_text_msg", { textQuicMsg: textMsg });
  } catch (e) {
    tempMsg.ack = undefined;
    showToast({ message: "发送失败", icon: "fail" });
  }
};

const sendImage = async () => {
  try {
    const filePaths = await selectFile(false, false, [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
    ]);
    if (!filePaths || filePaths.length === 0) return;

    let filePath = filePaths[0];
    
    // 处理 Android content:// URI
    if (filePath.startsWith("content://")) {
      try {
        const fileData = await readFile(filePath);
        const timestamp = Date.now();
        const tempPath = `umi_gitee_temp/image_${timestamp}.jpg`;
        
        await writeFile(tempPath, fileData);
        filePath = tempPath;
        console.log("Content URI resolved to:", filePath);
      } catch (e) {
        showToast({ message: "读取图片失败", icon: "fail" });
        return;
      }
    }

    const nanoId = [...Array(21)]
      .map(
        () =>
          "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"[
            Math.floor(Math.random() * 64)
          ]
      )
      .join("");
    const textMsg: TextQuicMsgVo = {
      nano_id: nanoId,
      text_type: 2,
      raw: filePath,
      recv_user: friendId,
      send_user: "",
      timestamp: Date.now(),
    };
    const previewUrl = convertPathToTauriUrl(filePath);
    const tempMsg: ChatMessage = {
      from: "mine",
      textMsg,
      ack: false,
      showTime:
        messages.value.length === 0 ||
        Date.now() -
          messages.value[messages.value.length - 1].textMsg.timestamp >
          10 * 60 * 1000,
      imageUrl: previewUrl,
      sendingImage: true,
    };
    messages.value.push(tempMsg);
    await nextTick();
    scrollToBottom(true);

    showLoadingToast({
      message: "发送图片中...",
      forbidClick: true,
      duration: 0,
    });
    try {
      await invoke("send_image_msg", { textQuicMsg: textMsg });
    } catch {
      tempMsg.ack = undefined;
      tempMsg.sendingImage = false;
      showToast({ message: "图片发送失败", icon: "fail" });
    } finally {
      closeToast();
    }
  } catch (e) {
    console.error("选择图片失败:", e);
  }
};

watch(textMessage, async (msg) => {
  if (!msg) return;
  if (msg.text_type === 201) {
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === msg.raw);
    if (idx !== -1) messages.value[idx].ack = true;
  } else {
    if (messages.value.find((m) => m.textMsg.nano_id === msg.nano_id)) return;
    const from = (
      msg.send_user === meUuid.value
        ? "mine"
        : msg.send_user === "system"
        ? "system"
        : "friend"
    ) as ChatMessage["from"];
    const prev = messages.value[messages.value.length - 1];
    const newMsg: ChatMessage = {
      from,
      textMsg: msg,
      ack: undefined,
      showTime:
        !prev || msg.timestamp - prev.textMsg.timestamp > 10 * 60 * 1000,
    };
    if (msg.text_type === 2) {
      newMsg.imageUrl = await loadImageMessage(msg);
    }
    messages.value.push(newMsg);
    nextTick(() => scrollToBottom(true));
  }
  invoke("mark_read_chat_session", { friendUuid: friendId }).catch(() => {});
});

onMounted(async () => {
  meUuid.value = await getMyUuid();
  if (!meUuid.value) {
    router.replace("/login");
    return;
  }
  await loadFriendInfo();
  await loadAvatars();
  await loadMessages(1);
  invoke("mark_read_chat_session", { friendUuid: friendId }).catch(() => {});

  if (window.visualViewport) {
    const vv = window.visualViewport;
    const handleViewportChange = () => {
      if (chatPageRef.value) {
        chatPageRef.value.style.height = `${vv.height}px`;
      }
    };
    vv.addEventListener("resize", handleViewportChange);
  }
});

const scrollToBottom = (smooth: boolean) => {
  const el = containerRef.value;
  if (!el) return;
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? "smooth" : ("instant" as any),
  });
};

const getMessageText = (msg: TextQuicMsgVo): string => {
  switch (msg.text_type) {
    case 1:
      try {
        return JSON.parse(msg.raw).text || "";
      } catch {
        return msg.raw || "";
      }
    case 3:
      return "[文件]";
    case 4:
      return "[隐私模式]";
    case 5:
      return "[视频通话]";
    case 100:
      return "[WebRTC信令]";
    default:
      return msg.raw || "";
  }
};

const getFriendAvatar = () => chatAvatar.value || DEFAULT_AVATAR;
const goBack = () => router.back();
</script>

<template>
  <div class="chat-page" ref="chatPageRef">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <img
        :src="getFriendAvatar()"
        class="header-avatar"
        @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
      />
      <div class="header-info">
        <span class="header-name">{{ friendInfo.name || friendId }}</span>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else ref="containerRef" class="message-container" @scroll="onScroll">
      <div v-if="loadingMore" class="loading-more">
        <div class="loading-spinner small"></div>
      </div>
      <div class="message-list">
        <template v-for="msg in messages" :key="msg.textMsg.nano_id">
          <div v-if="msg.showTime" class="time-divider">
            <span>{{ formatMessageTime(msg.textMsg.timestamp) }}</span>
          </div>
          <div v-if="msg.from === 'system'" class="system-msg">
            {{ getMessageText(msg.textMsg) }}
          </div>

          <!-- Friend message: avatar on left -->
          <div v-else-if="msg.from === 'friend'" class="msg-row msg-friend">
            <img
              :src="getFriendAvatar()"
              class="msg-avatar"
              @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
            />
            <div class="msg-content">
              <template v-if="msg.textMsg.text_type === 2 && msg.imageUrl">
                <img :src="msg.imageUrl" class="msg-image" alt="图片消息" />
              </template>
              <template v-else>
                <div class="bubble bubble-friend">
                  {{ getMessageText(msg.textMsg) }}
                </div>
              </template>
            </div>
          </div>

          <!-- My message: avatar on right, sent badge inside bubble -->
          <div v-else class="msg-row msg-mine">
            <img
              :src="myAvatar || DEFAULT_AVATAR"
              class="msg-avatar"
              @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
            />
            <div class="msg-content">
              <template
                v-if="
                  msg.textMsg.text_type === 2 &&
                  (msg.imageUrl || msg.sendingImage)
                "
              >
                <div class="msg-image-wrapper">
                  <img
                    v-if="msg.imageUrl"
                    :src="msg.imageUrl"
                    class="msg-image"
                    alt="图片消息"
                  />
                  <div v-else class="msg-image-placeholder">发送中...</div>
                </div>
              </template>
              <template v-else>
                <div
                  class="bubble bubble-mine"
                  :class="{ 'has-ack': msg.ack === true }"
                >
                  {{ getMessageText(msg.textMsg) }}
                  <span v-if="msg.ack === true" class="sent-badge">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              </template>
              <span
                v-if="msg.ack === false && !msg.sendingImage"
                class="ack-label ack-pending"
                >发送中</span
              >
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="input-bar" v-if="!loading">
      <button class="img-btn" @click="sendImage">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
          />
        </svg>
      </button>
      <input
        ref="inputRef"
        v-model="inputText"
        class="text-input"
        placeholder="输入消息..."
        @keyup.enter="sendMessage"
      />
      <button
        class="send-btn"
        :disabled="!inputText.trim()"
        @click="sendMessage"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.chat-page {
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
.header-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-xs);
}
.header-info {
  flex: 1;
  min-width: 0;
}
.header-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-tertiary);
  p {
    font-size: 14px;
  }
}
.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-medium);
  border-top-color: var(--brand-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  &.small {
    width: 20px;
    height: 20px;
    border-width: 2px;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.message-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 0;
  -webkit-overflow-scrolling: touch;
}
.loading-more {
  display: flex;
  justify-content: center;
  padding: 12px;
}
.message-list {
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.time-divider {
  display: flex;
  justify-content: center;
  padding: 12px 0;
  span {
    font-size: 11px;
    color: var(--text-placeholder);
    background: var(--surface);
    padding: 4px 12px;
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-xs);
  }
}
.system-msg {
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
  padding: 6px 0;
}

// ===== Message rows with avatars =====
.msg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.msg-friend {
  flex-direction: row;
}
.msg-mine {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}

.msg-content {
  max-width: calc(100% - 50px);
  display: flex;
  flex-direction: column;
}

// ===== Bubbles =====
.bubble {
  padding: 10px 14px;
  border-radius: 18px;
  word-break: break-word;
  line-height: 1.5;
  font-size: 15px;
  position: relative;
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
  &.has-ack {
    padding-right: 26px;
  }
}

// ===== Ack sent badge (inside bubble, bottom-right) =====
.sent-badge {
  position: absolute;
  bottom: 4px;
  right: 6px;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}

// ===== Ack label outside bubble =====
.ack-label {
  font-size: 11px;
  margin-top: 2px;
  align-self: flex-end;
}
.ack-pending {
  color: var(--text-placeholder);
}

// ===== Image messages =====
.msg-image {
  max-width: 240px;
  max-height: 320px;
  border-radius: 10px;
  box-shadow: var(--shadow-md);
  object-fit: cover;
  display: block;
}
.msg-image-wrapper {
  position: relative;
}
.msg-image-placeholder {
  width: 160px;
  height: 120px;
  border-radius: 10px;
  background: var(--surface-alt);
  border: 1px dashed var(--border-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-placeholder);
}

.input-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}
.img-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;
  svg {
    width: 22px;
    height: 22px;
  }
  &:active {
    background: var(--surface-hover);
    color: var(--brand-blue);
  }
}
.text-input {
  flex: 1;
  height: 40px;
  padding: 0 16px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: 20px;
  outline: none;
  font-size: 15px;
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
  &::placeholder {
    color: var(--text-placeholder);
  }
  &:focus {
    border-color: var(--brand-blue);
    box-shadow: var(--shadow-glow-sm);
  }
}
.send-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  svg {
    width: 20px;
    height: 20px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    transform: scale(0.95);
  }
}
</style>
