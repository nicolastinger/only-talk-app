<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { showToast, showConfirmDialog } from "vant";
import { useMessageApi } from "@/hooks/useMessageApi";
import { useGroupMessageAck } from "@/hooks/useGroupMessageAck";
import { useGroupMemberInfo } from "@/hooks/useGroupMemberInfo";
import { useAvatar } from "@/hooks/useAvatar";
import { getMyUuid } from "@/utils/api";
import { attachViewportHeight } from "@/utils/viewport";
import { resolveContentToTempFile } from "@/utils/tempImage";
import { convertPathToTauriUrl, selectFile } from "@workspace/services";
import { DEFAULT_AVATAR } from "@/stores/user";
import { useMyAvatar } from "@/hooks/useMyAvatar";
import type { TextQuicMsgVo, GroupVo } from "@workspace/types";
import type { UiChatMessage } from "@/chat/types";
import {
  MSG_TYPE_GROUP_IMAGE,
  MSG_TYPE_GROUP_TEXT,
  MSG_TYPE_GROUP_FILE,
  MSG_TYPE_RECALL_SUCCESS,
  MSG_TYPE_RECALL_FAILURE,
  RELOAD_ON_ACK_TYPES,
} from "@/chat/messageTypes";
import { needTimeDivider, parseGroupImageBizId } from "@/chat/messageParse";
import { loadImageUrl } from "@/chat/media";
import { genNanoId } from "@/chat/id";
import MessageList from "@/components/chat/MessageList.vue";
import MessageInputBar from "@/components/chat/MessageInputBar.vue";
import ImagePreviewer from "@/components/chat/ImagePreviewer.vue";

const route = useRoute();
const router = useRouter();
const groupId = route.params.groupId as string;

const messages = ref<UiChatMessage[]>([]);
const inputText = ref("");
const loading = ref(true);
const loadingMore = ref(false);
const currentPage = ref(1);
const hasMore = ref(true);
const pageSize = 20;
const groupInfo = reactive<Partial<GroupVo>>({
  group_name: "",
  avatar: "",
  member_count: 0,
});
const containerRef = ref<HTMLElement | null>(null);
const chatPageRef = ref<HTMLElement | null>(null);
const meUuid = ref("");

let allowInfiniteScroll = false;

const { textMessage } = useMessageApi(() => groupId, undefined, true);
const { groupAckMessage } = useGroupMessageAck(groupId);
const { getAvatarUrl } = useAvatar();
const { myAvatar, ensureMyAvatar } = useMyAvatar(() => meUuid.value);

const groupAvatar = ref<string | null>(null);
const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
let viewportCleanup: (() => void) | null = null;

const senderUuids = computed(() => {
  const set = new Set<string>();
  for (const m of messages.value) {
    const uuid = m.textMsg.send_user;
    if (uuid && uuid !== meUuid.value && uuid !== "system") set.add(uuid);
  }
  return [...set];
});

const { memberMap, avatarUrlMap } = useGroupMemberInfo(() => senderUuids.value);

const isGroupImage = (t: number) => t === MSG_TYPE_GROUP_IMAGE;

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
  if (groupInfo.avatar) {
    const url = await getAvatarUrl(groupInfo.avatar);
    if (url) groupAvatar.value = url;
  }
};

const loadGroupInfo = async () => {
  try {
    const data = (await invoke("get_group_info_command", {
      groupId,
    })) as GroupVo;
    groupInfo.group_name = data.group_name;
    groupInfo.avatar = data.avatar;
    groupInfo.member_count = data.member_count;
  } catch {
    try {
      const localGroups = (await invoke("get_group_list")) as GroupVo[];
      const found = localGroups.find((g) => g.group_uuid === groupId);
      if (found) {
        groupInfo.group_name = found.group_name;
        groupInfo.avatar = found.avatar;
        groupInfo.member_count = found.member_count;
      }
    } catch {
      // ignore
    }
  }
};

const resolveGroupImageUrl = async (
  msg: TextQuicMsgVo
): Promise<string | null> => {
  const bizId = parseGroupImageBizId(msg.raw);
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
    showTime:
      index === 0 || needTimeDivider(arr[index - 1].timestamp, msg.timestamp),
    senderUuid: msg.send_user,
  };
};

const loadMessages = async (page = 1, prepend = false) => {
  if (page === 1) loading.value = true;
  else loadingMore.value = true;
  if (!prepend && page === 1) allowInfiniteScroll = false;
  try {
    const data = (await invoke("get_group_chat_record_from_store", {
      groupId,
      page: { size: pageSize, current: page, total: 0 },
    })) as TextQuicMsgVo[];
    if (data.length < pageSize) hasMore.value = false;

    const list = data.filter(
      (m) =>
        m.text_type !== MSG_TYPE_RECALL_SUCCESS &&
        m.text_type !== MSG_TYPE_RECALL_FAILURE
    );
    const chatMessages: UiChatMessage[] = [];
    for (let i = 0; i < list.length; i++) {
      const ui = makeUiMessage(list[i], i, list);
      if (isGroupImage(list[i].text_type)) {
        ui.imageUrl = await resolveGroupImageUrl(list[i]);
      }
      chatMessages.push(ui);
    }

    if (prepend) {
      // 对齐 PC：向上加载历史时保持当前滚动位置，避免视口跳动
      const prevScrollHeight = containerRef.value?.scrollHeight || 0;
      messages.value = [...chatMessages, ...messages.value];
      await nextTick();
      const el = containerRef.value;
      if (el) {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = newScrollHeight - prevScrollHeight;
      }
    } else {
      messages.value = chatMessages;
      currentPage.value = 1;
      await nextTick();
    }
  } catch (e) {
    console.error("加载群消息失败:", e);
  } finally {
    loading.value = false;
    loadingMore.value = false;
    if (!prepend) {
      // 容器在 loading=false 后才挂载，需在渲染完成后滚动到最新消息
      await nextTick();
      scrollToBottom(false);
      setTimeout(() => scrollToBottom(false), 120);
      setTimeout(() => {
        allowInfiniteScroll = true;
      }, 200);
    }
  }
};

const reloadFirstPage = () => {
  hasMore.value = true;
  loadMessages(1, false).catch(() => {});
};

const onScroll = () => {
  const el = containerRef.value;
  if (
    !el ||
    !allowInfiniteScroll ||
    loading.value ||
    loadingMore.value ||
    !hasMore.value
  )
    return;
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
  if (isGroupImage(msg.text_type)) {
    ui.imageUrl = await resolveGroupImageUrl(msg);
  }
  messages.value.push(ui);
};

/* ============ 发送 ============ */

const sendGroupText = async () => {
  const text = inputText.value.trim();
  if (!text) return;
  const textMsg: TextQuicMsgVo = {
    nano_id: genNanoId(),
    text_type: MSG_TYPE_GROUP_TEXT,
    raw: text,
    recv_user: groupId,
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
    await invoke("send_group_text_msg", { textQuicMsg: textMsg });
  } catch (e) {
    console.error("群消息发送失败:", e);
    const idx = messages.value.findIndex(
      (m) => m.textMsg.nano_id === textMsg.nano_id
    );
    if (idx !== -1) messages.value[idx].failed = true;
    showToast({ message: "发送失败，点击消息重试", icon: "fail" });
  }
};

const selectAndSendGroup = async (
  media: "image" | "file",
  type: number,
  command: string
) => {
  try {
    const filters =
      media === "image"
        ? [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "gif", "webp"],
            },
          ]
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
      recv_user: groupId,
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
      console.error("群媒体发送失败:", e);
      const idx = messages.value.findIndex(
        (m) => m.textMsg.nano_id === textMsg.nano_id
      );
      if (idx !== -1) {
        messages.value[idx].failed = true;
        messages.value[idx].sendingImage = false;
      }
      showToast({
        message: media === "image" ? "图片发送失败" : "文件发送失败",
        icon: "fail",
      });
    }
  } catch (e) {
    console.error("选择文件失败:", e);
  }
};

const sendGroupImage = () =>
  selectAndSendGroup("image", MSG_TYPE_GROUP_IMAGE, "send_group_image_msg");
const sendGroupFile = () =>
  selectAndSendGroup("file", MSG_TYPE_GROUP_FILE, "send_group_file_msg");

/** 群聊失败重发：群消息无 retry_send_msg 通道，重新以新 nano_id 发送 */
const handleRetry = async (msg: UiChatMessage) => {
  const idx = messages.value.findIndex(
    (m) => m.textMsg.nano_id === msg.textMsg.nano_id
  );
  if (idx !== -1) {
    messages.value.splice(idx, 1);
  }
  const raw = msg.textMsg.raw;
  const type = msg.textMsg.text_type;
  const textMsg: TextQuicMsgVo = {
    nano_id: genNanoId(),
    text_type: type,
    raw,
    recv_user: groupId,
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
  if (type === MSG_TYPE_GROUP_IMAGE) {
    ui.imageUrl = convertPathToTauriUrl(raw);
    ui.sendingImage = true;
  }
  messages.value.push(ui);
  await nextTick();
  scrollToBottom(true);
  startAckTimer(textMsg.nano_id);

  const command =
    type === MSG_TYPE_GROUP_TEXT
      ? "send_group_text_msg"
      : type === MSG_TYPE_GROUP_IMAGE
      ? "send_group_image_msg"
      : "send_group_file_msg";
  try {
    await invoke(command, { textQuicMsg: textMsg });
  } catch (e) {
    console.error("群消息重发失败:", e);
    const i = messages.value.findIndex(
      (m) => m.textMsg.nano_id === textMsg.nano_id
    );
    if (i !== -1) {
      messages.value[i].failed = true;
      messages.value[i].sendingImage = false;
    }
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
  invoke("mark_read_chat_session", { friendUuid: groupId }).catch(() => {});
});

// 群消息 ack（2201 → group_message_ack 事件）
watch(groupAckMessage, async (ack) => {
  if (!ack) return;
  const idx = messages.value.findIndex((m) => m.textMsg.nano_id === ack.raw);
  if (idx !== -1) {
    clearAckTimer(ack.raw);
    messages.value[idx].ack = true;
    messages.value[idx].failed = false;
    if (RELOAD_ON_ACK_TYPES.includes(messages.value[idx].textMsg.text_type)) {
      reloadFirstPage();
    }
  }
});

// 对齐 PC：列表末尾消息变化且无 ack 时打群已读
watch(
  messages,
  (list) => {
    if (list.length > 1) {
      const last = list[list.length - 1];
      if (last.textMsg.nano_id && last.ack === undefined) {
        invoke("mark_group_read", {
          groupUuid: groupId,
          nanoId: last.textMsg.nano_id,
          timestamp: last.textMsg.timestamp,
        }).catch(() => {});
      }
    }
  },
  { deep: false }
);

const handleLeaveGroup = async () => {
  try {
    await showConfirmDialog({
      title: "退出群聊",
      message: "确定要退出该群聊吗？",
      confirmButtonText: "退出",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await invoke("leave_group_command", { groupId });
    router.back();
  } catch (e) {
    console.error("退出群聊失败:", e);
    showToast({ message: "退出群聊失败", icon: "fail" });
  }
};

const markReadSession = () => {
  invoke("mark_read_chat_session", { friendUuid: groupId }).catch(() => {});
};

onMounted(async () => {
  meUuid.value = await getMyUuid();
  if (!meUuid.value) {
    router.replace("/login");
    return;
  }
  await loadGroupInfo();
  await loadAvatars();
  await loadMessages(1);
  markReadSession();
  invoke("add_user_map", {
    map: { current_session_friend: groupId },
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
  const bizId = parseGroupImageBizId(msg.textMsg.raw);
  if (!bizId) return;
  try {
    const { getGroupImageMessages } = await import("@workspace/services");
    const result = await getGroupImageMessages(
      groupId,
      bizId,
      msg.textMsg.nano_id
    );
    if (result.imageUrls.length > 0) {
      preview.value = { urls: result.imageUrls, index: result.currentIndex };
    }
  } catch (e) {
    console.error("获取群图片列表失败:", e);
  }
};
</script>

<template>
  <div class="group-chat-page" ref="chatPageRef">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <img
        :src="groupAvatar || DEFAULT_AVATAR"
        class="header-avatar"
        alt="群头像"
        @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
      />
      <div class="header-info">
        <span class="header-name">{{ groupInfo.group_name || groupId }}</span>
        <span v-if="groupInfo.member_count" class="header-count"
          >{{ groupInfo.member_count }}人</span
        >
      </div>
      <button class="more-btn" aria-label="群聊设置" @click="handleLeaveGroup">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          style="width: 20px; height: 20px"
        >
          <path
            d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
          />
        </svg>
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else ref="containerRef" class="message-container" @scroll="onScroll">
      <div v-if="loadingMore" class="loading-more">
        <div class="loading-spinner small"></div>
      </div>
      <div v-if="!hasMore && messages.length > 0" class="no-more">
        没有更多消息了
      </div>
      <MessageList
        mode="group"
        :messages="messages"
        :my-avatar="myAvatar || DEFAULT_AVATAR"
        :peer-avatar="groupAvatar || DEFAULT_AVATAR"
        :fallback-avatar="DEFAULT_AVATAR"
        :member-map="memberMap"
        :avatar-url-map="avatarUrlMap"
        @preview="handlePreview"
        @retry="handleRetry"
      />
    </div>

    <MessageInputBar
      v-if="!loading"
      v-model="inputText"
      :tools="['emoji', 'image', 'file']"
      placeholder="输入消息..."
      @send="sendGroupText"
      @pick-image="sendGroupImage"
      @pick-file="sendGroupFile"
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
.group-chat-page {
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
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-count {
  font-size: 12px;
  color: var(--text-placeholder);
  margin-left: 6px;
}
.more-btn {
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
  flex-shrink: 0;
  svg {
    width: 18px;
    height: 18px;
  }
  &:active {
    background: var(--surface-hover);
  }
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
.no-more {
  display: flex;
  justify-content: center;
  padding: 8px;
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
