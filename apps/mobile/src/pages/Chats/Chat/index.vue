<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "vant";
import { useMessageApi } from "@/hooks/useMessageApi";
import { useAvatar } from "@/hooks/useAvatar";
import { useMyAvatar } from "@/hooks/useMyAvatar";
import { useCallManager } from "@/webrtc/callManager";
import { getMyUuid } from "@/utils/api";
import { attachViewportHeight } from "@/utils/viewport";
import { resolveContentToTempFile } from "@/utils/tempImage";
import { convertPathToTauriUrl, selectFile } from "@workspace/services";
import { DEFAULT_AVATAR } from "@/stores/user";
import type { TextQuicMsgVo, ChatSessionVo, FriendVo } from "@workspace/types";
import type { UiChatMessage } from "@/chat/types";
import {
  MSG_TYPE_IMAGE,
  MSG_TYPE_RECALL_FAILURE,
  MSG_TYPE_RECALL_SUCCESS,
  RELOAD_ON_ACK_TYPES,
} from "@/chat/messageTypes";
import { needTimeDivider, parsePrivateImageBizId } from "@/chat/messageParse";
import { loadImageUrl } from "@/chat/media";
import { genNanoId } from "@/chat/id";
import MessageList from "@/components/chat/MessageList.vue";
import MessageInputBar from "@/components/chat/MessageInputBar.vue";
import ImagePreviewer from "@/components/chat/ImagePreviewer.vue";

const route = useRoute();
const router = useRouter();
const friendId = route.params.friendId as string;

const messages = ref<UiChatMessage[]>([]);
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
const { myAvatar, ensureMyAvatar } = useMyAvatar(() => meUuid.value);

const chatAvatar = ref<string | null>(null);
const isSelf = computed(() => !!meUuid.value && friendId === meUuid.value);

const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
let viewportCleanup: (() => void) | null = null;

const isImageType = (t: number) => t === MSG_TYPE_IMAGE;

const startAckTimer = (nanoId: string) => {
  clearAckTimer(nanoId);
  const timer = setTimeout(() => {
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === nanoId);
    if (idx !== -1 && messages.value[idx].ack === false) {
      messages.value[idx].failed = true;
    }
    ackTimers.delete(nanoId);
  }, 10000);
  ackTimers.set(nanoId, timer);
};

const clearAckTimer = (nanoId: string) => {
  const timer = ackTimers.get(nanoId);
  if (timer) {
    clearTimeout(timer);
    ackTimers.delete(nanoId);
  }
};

const loadAvatars = async () => {
  await ensureMyAvatar();
  if (friendInfo.icon) {
    const url = await getAvatarUrl(friendInfo.icon);
    if (url) chatAvatar.value = url;
  }
};

const loadFriendInfo = async () => {
  try {
    const data = (await invoke("get_friend_info", {
      friendUuid: friendId,
    })) as FriendVo;
    friendInfo.name = data.friend_name || "";
    friendInfo.icon = data.friend_icon || "";
    return;
  } catch {
    // fallthrough to local session
  }
  try {
    const sessions = (await invoke("get_chat_session_from_store")) as ChatSessionVo[];
    const session = sessions.find(
      (s) => s.send_user === friendId || s.recv_user === friendId
    );
    if (session) {
      friendInfo.name = session.friend_name || "";
      friendInfo.icon = session.friend_icon || "";
    }
  } catch {
    // ignore
  }
};

const resolveImageUrl = async (msg: TextQuicMsgVo): Promise<string | null> => {
  const bizId = parsePrivateImageBizId(msg.raw);
  if (!bizId) return null;
  return loadImageUrl(bizId, msg.nano_id);
};

const makeUiMessage = (
  msg: TextQuicMsgVo,
  index: number,
  arr: TextQuicMsgVo[]
): UiChatMessage => {
  const mine = msg.send_user === meUuid.value;
  const system = msg.send_user === "system";
  return {
    from: mine ? "mine" : system ? "system" : "friend",
    textMsg: msg,
    ack: undefined,
    failed: false,
    showTime: index === 0 || needTimeDivider(arr[index - 1].timestamp, msg.timestamp),
    senderUuid: msg.send_user,
  };
};

const loadMessages = async (page = 1, prepend = false) => {
  if (page === 1) loading.value = true;
  else loadingMore.value = true;
  try {
    const textQuicMsg: TextQuicMsgVo = {
      nano_id: "",
      raw: "",
      recv_user: meUuid.value,
      send_user: friendId,
      text_type: 0,
      timestamp: 0,
    };
    const data = (await invoke("get_chat_record_from_store", {
      textQuicMsg,
      page: { size: pageSize, current: page, total: 0 },
    })) as TextQuicMsgVo[];
    if (data.length < pageSize) hasMore.value = false;

    const list = data.filter(
      (m) => m.text_type !== MSG_TYPE_RECALL_SUCCESS && m.text_type !== MSG_TYPE_RECALL_FAILURE
    );
    const chatMessages: UiChatMessage[] = await Promise.all(
      list.map(async (item, index, arr) => {
        const msg = makeUiMessage(item, index, arr);
        if (isImageType(item.text_type)) {
          msg.imageUrl = await resolveImageUrl(item);
        }
        return msg;
      })
    );

    if (prepend) {
      messages.value = [...chatMessages, ...messages.value];
    } else {
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

const reloadFirstPage = () => {
  hasMore.value = true;
  loadMessages(1, false).catch(() => {});
};

const onScroll = () => {
  const el = containerRef.value;
  if (!el || loadingMore.value || !hasMore.value) return;
  if (el.scrollTop <= 80) {
    const nextPage = currentPage.value + 1;
    currentPage.value = nextPage;
    loadMessages(nextPage, true).catch(() => {});
  }
};

const scrollToBottom = (smooth: boolean) => {
  const el = containerRef.value;
  if (!el) return;
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? "smooth" : ("instant" as ScrollBehavior),
  });
};

const pushMessage = async (msg: TextQuicMsgVo) => {
  if (messages.value.find((m) => m.textMsg.nano_id === msg.nano_id)) return;
  const prev = messages.value[messages.value.length - 1];
  const mine = msg.send_user === meUuid.value;
  const system = msg.send_user === "system";
  const ui: UiChatMessage = {
    from: mine ? "mine" : system ? "system" : "friend",
    textMsg: msg,
    ack: undefined,
    failed: false,
    showTime: !prev || needTimeDivider(prev.textMsg.timestamp, msg.timestamp),
    senderUuid: msg.send_user,
  };
  if (isImageType(msg.text_type)) {
    ui.imageUrl = await resolveImageUrl(msg);
  }
  messages.value.push(ui);
};

/* ============ 发送 ============ */

const sendText = async () => {
  const text = inputText.value.trim();
  if (!text) return;
  const textMsg: TextQuicMsgVo = {
    nano_id: genNanoId(),
    text_type: 1,
    raw: JSON.stringify({ text, prev_id: "", platform: 0 }),
    recv_user: friendId,
    send_user: "",
    timestamp: Date.now(),
  };
  const ui: UiChatMessage = {
    from: "mine",
    textMsg,
    ack: false,
    failed: false,
    showTime:
      messages.value.length === 0 ||
      needTimeDivider(
        messages.value[messages.value.length - 1].textMsg.timestamp,
        Date.now()
      ),
    senderUuid: meUuid.value,
  };
  messages.value.push(ui);
  inputText.value = "";
  await nextTick();
  scrollToBottom(true);
  startAckTimer(textMsg.nano_id);
  try {
    await invoke("send_text_msg", { textQuicMsg: textMsg });
  } catch (e) {
    console.error("发送失败:", e);
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === textMsg.nano_id);
    if (idx !== -1) messages.value[idx].failed = true;
    showToast({ message: "发送失败，点击消息重试", icon: "fail" });
  }
};

const selectAndSend = async (
  media: "image" | "file",
  type: number,
  command: string
) => {
  try {
    const filters =
      media === "image"
        ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }]
        : undefined;
    const filePaths = await selectFile(false, false, filters);
    if (!filePaths || filePaths.length === 0) return;

    let filePath = filePaths[0];
    let localPreview: string | null = null;
    if (filePath.startsWith("content://")) {
      try {
        const { tempPath, preview } = await resolveContentToTempFile(filePath);
        filePath = tempPath;
        localPreview = preview;
      } catch (e) {
        console.error("读取文件失败:", e);
        showToast({ message: "读取文件失败", icon: "fail" });
        return;
      }
    }

    const textMsg: TextQuicMsgVo = {
      nano_id: genNanoId(),
      text_type: type,
      raw: filePath,
      recv_user: friendId,
      send_user: "",
      timestamp: Date.now(),
    };
    const ui: UiChatMessage = {
      from: "mine",
      textMsg,
      ack: false,
      failed: false,
      showTime:
        messages.value.length === 0 ||
        needTimeDivider(
          messages.value[messages.value.length - 1].textMsg.timestamp,
          Date.now()
        ),
      senderUuid: meUuid.value,
    };
    if (media === "image") {
      ui.imageUrl = localPreview || convertPathToTauriUrl(filePath);
      ui.sendingImage = true;
    }
    messages.value.push(ui);
    await nextTick();
    scrollToBottom(true);
    startAckTimer(textMsg.nano_id);
    try {
      await invoke(command, { textQuicMsg: textMsg });
    } catch (e) {
      console.error("发送媒体失败:", e);
      const idx = messages.value.findIndex((m) => m.textMsg.nano_id === textMsg.nano_id);
      if (idx !== -1) {
        messages.value[idx].failed = true;
        messages.value[idx].sendingImage = false;
      }
      showToast({ message: media === "image" ? "图片发送失败" : "文件发送失败", icon: "fail" });
    }
  } catch (e) {
    console.error("选择文件失败:", e);
  }
};

const sendImage = () => selectAndSend("image", MSG_TYPE_IMAGE, "send_image_msg");
const sendFile = () => selectAndSend("file", 3, "send_file_msg");

/** 失败消息重发：优先走 Rust 补发，若不存在发送记录则直接重发 */
const handleRetry = async (msg: UiChatMessage) => {
  const idx = messages.value.findIndex((m) => m.textMsg.nano_id === msg.textMsg.nano_id);
  const update = (failed: boolean, ack?: boolean | undefined) => {
    if (idx !== -1) {
      messages.value[idx].failed = failed;
      if (ack !== undefined) messages.value[idx].ack = ack;
    }
  };
  update(false, false);
  startAckTimer(msg.textMsg.nano_id);
  try {
    await invoke("retry_send_msg", { sendId: msg.textMsg.nano_id });
    return;
  } catch {
    // 本地无发送记录 → 直接重发
  }
  const commandMap: Record<number, string> = {
    1: "send_text_msg",
    2: "send_image_msg",
    3: "send_file_msg",
  };
  const command = commandMap[msg.textMsg.text_type];
  try {
    if (command) await invoke(command, { textQuicMsg: msg.textMsg });
    else throw new Error("不支持的类型");
  } catch (e) {
    console.error("重发失败:", e);
    update(true, undefined);
    showToast({ message: "重发失败", icon: "fail" });
  }
};

/* ============ 实时消息 ============ */

watch(textMessage, async (msg) => {
  if (!msg) return;
  if (msg.text_type === MSG_TYPE_RECALL_SUCCESS) {
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === msg.raw);
    if (idx !== -1) {
      clearAckTimer(msg.raw);
      messages.value[idx].ack = true;
      messages.value[idx].failed = false;
      if (RELOAD_ON_ACK_TYPES.includes(messages.value[idx].textMsg.text_type)) {
        reloadFirstPage();
      }
    } else {
      // 重发/补发的消息此前从未渲染，直接刷新
      reloadFirstPage();
    }
    return;
  }
  if (msg.text_type === MSG_TYPE_RECALL_FAILURE) {
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === msg.raw);
    if (idx !== -1) messages.value[idx].failed = true;
    return;
  }
  await pushMessage(msg);
  nextTick(() => scrollToBottom(true));
  invoke("mark_read_chat_session", { friendUuid: friendId }).catch(() => {});
});

// 对齐 PC：列表末尾消息变化且无 ack 时打已读标记
watch(
  messages,
  (list) => {
    if (list.length > 1) {
      const last = list[list.length - 1];
      if (last.textMsg.nano_id && last.ack === undefined) {
        invoke("mark_read", { textQuicMsgVec: [last.textMsg.nano_id] }).catch(
          () => {}
        );
      }
    }
  },
  { deep: false }
);

const markReadSession = () => {
  invoke("mark_read_chat_session", { friendUuid: friendId }).catch(() => {});
};

onMounted(async () => {
  meUuid.value = await getMyUuid();
  if (!meUuid.value) {
    router.replace("/login");
    return;
  }
  await loadFriendInfo();
  await loadAvatars();
  await loadMessages(1);
  markReadSession();
  invoke("add_user_map", {
    map: { current_session_friend: friendId },
  }).catch(() => {});

  viewportCleanup = attachViewportHeight(() => chatPageRef.value);
});

onUnmounted(() => {
  ackTimers.forEach((t) => clearTimeout(t));
  ackTimers.clear();
  viewportCleanup?.();
  invoke("add_user_map", {
    map: { current_session_friend: "-1" },
  }).catch(() => {});
});

const goBack = () => router.back();

/* ============ 图片预览 ============ */
const preview = ref<{ urls: string[]; index: number } | null>(null);

const handlePreview = async (msg: UiChatMessage) => {
  if (preview.value) return;
  const bizId = parsePrivateImageBizId(msg.textMsg.raw);
  if (!bizId) return;
  try {
    const { getFriendImageMessages } = await import("@workspace/services");
    const result = await getFriendImageMessages(
      meUuid.value,
      friendId,
      bizId,
      msg.textMsg.nano_id
    );
    if (result.imageUrls.length > 0) {
      preview.value = { urls: result.imageUrls, index: result.currentIndex };
    }
  } catch (e) {
    console.error("获取图片列表失败:", e);
  }
};

/* ============ 通话 ============ */
const { startCall } = useCallManager();
const handleStartCall = async (media: "audio" | "video") => {
  await startCall(friendId, media);
};

const friendTools = ["emoji", "image", "file", "audio", "video"] as const;
const selfTools = ["emoji", "image"] as const;
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
        :src="chatAvatar || DEFAULT_AVATAR"
        class="header-avatar"
        alt="头像"
        @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
      />
      <div class="header-info">
        <span class="header-name">{{
          isSelf ? "我的笔记" : friendInfo.name || friendId
        }}</span>
      </div>
      <div class="header-actions">
        <button
          v-if="!isSelf"
          class="header-more"
          aria-label="好友设置"
          @click="router.push(`/friends/detail/${friendId}`)"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
            />
          </svg>
        </button>
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
      <MessageList
        mode="single"
        :messages="messages"
        :my-avatar="myAvatar || DEFAULT_AVATAR"
        :peer-avatar="chatAvatar || DEFAULT_AVATAR"
        :fallback-avatar="DEFAULT_AVATAR"
        @preview="handlePreview"
        @retry="handleRetry"
      />
    </div>

    <MessageInputBar
      v-if="!loading"
      v-model="inputText"
      :tools="isSelf ? (selfTools as any) : (friendTools as any)"
      placeholder="输入消息..."
      @send="sendText"
      @pick-image="sendImage"
      @pick-file="sendFile"
      @call="handleStartCall"
    />

    <ImagePreviewer
      v-if="preview"
      :urls="preview.urls"
      :initial-index="preview.index"
      @close="preview = null"
    />
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
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.header-more {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  svg {
    width: 18px;
    height: 18px;
  }
  &:active {
    background: var(--surface-hover);
    color: var(--brand-blue);
  }
}
.header-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: 8px;
}
</style>
