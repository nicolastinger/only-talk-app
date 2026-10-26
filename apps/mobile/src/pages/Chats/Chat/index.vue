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
import { useAvatar } from "@/hooks/useAvatar";
import { useMyAvatar } from "@/hooks/useMyAvatar";
import { useCallManager } from "@/webrtc/callManager";
import { useChatBackgroundFor } from "@/stores/chatBackground";
import { getMyUuid } from "@/utils/api";
import { attachViewportHeight } from "@/utils/viewport";
import { resolveContentToTempFile } from "@/utils/tempImage";
import {
  convertPathToTauriUrl,
  getAllFileExtensions,
  getImageExtensions,
  getLocalFileSize,
  listenChatFileUploadProgress,
  selectFile,
  shouldAutoDownloadImage,
} from "@workspace/services";
import { DEFAULT_AVATAR } from "@/stores/user";
import { UPLOAD_LIMITS } from "@workspace/types";
import type { TextQuicMsgVo, ChatSessionVo, FriendVo } from "@workspace/types";
import type { UiChatMessage } from "@/chat/types";
import {
  MSG_TYPE_FILE,
  MSG_TYPE_IMAGE,
  MSG_TYPE_RECALL_FAILURE,
  MSG_TYPE_RECALL_SUCCESS,
  MSG_TYPE_VOICE,
  RELOAD_ON_ACK_TYPES,
} from "@/chat/messageTypes";
import {
  isRecallMessage,
  isTransientMessageType,
  needTimeDivider,
  parsePrivateImageBizId,
} from "@/chat/messageParse";
import { loadImageUrl } from "@/chat/media";
import { genNanoId } from "@/chat/id";
import { collectCopyableText, copyTextToClipboard } from "@/chat/clipboard";
import { useMessageSelection } from "@/chat/useMessageSelection";
import type { VoiceRecordingResult } from "@/chat/useVoiceRecorder";
import MessageList from "@/components/chat/MessageList.vue";
import MessageInputBar from "@/components/chat/MessageInputBar.vue";
import type { InputTool } from "@/components/chat/MessageInputBar.vue";
import VoiceRecordOverlay from "@/components/chat/VoiceRecordOverlay.vue";
import ImagePreviewer from "@/components/chat/ImagePreviewer.vue";
import PendingSendBar from "@/components/chat/PendingSendBar.vue";
import MessageSelectionBar from "@/components/chat/MessageSelectionBar.vue";
import ForwardPicker from "@/components/chat/ForwardPicker.vue";
import { useI18n } from "@/i18n";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const friendId = route.params.friendId as string;

const messages = ref<UiChatMessage[]>([]);
const inputText = ref("");
const loading = ref(true);
const loadingMore = ref(false);
const currentPage = ref(1);
const hasMore = ref(true);
const pageSize = 20;
const friendInfo = reactive({
  name: "",
  icon: "",
  user_type: undefined as number | undefined,
});
const containerRef = ref<HTMLElement | null>(null);
const chatPageRef = ref<HTMLElement | null>(null);
// 聊天背景(仅客户端): 好友专属背景优先, 未设置时回退全局背景
const chatBackgroundUrl = useChatBackgroundFor(() => friendId);
const chatBackgroundStyle = computed(() =>
  chatBackgroundUrl.value
    ? {
        backgroundImage: `url("${chatBackgroundUrl.value}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : undefined
);
const meUuid = ref("");
/** 是否停留在消息列表底部（决定软键盘弹起时是否自动贴底） */
const isAtBottom = ref(true);

let allowInfiniteScroll = false;

const { textMessage } = useMessageApi(() => meUuid.value, friendId);
const { getAvatarUrl } = useAvatar();
const { myAvatar, ensureMyAvatar } = useMyAvatar(() => meUuid.value);

const chatAvatar = ref<string | null>(null);
const isSelf = computed(() => !!meUuid.value && friendId === meUuid.value);
/** 当前是否允许自动下载对方发来的图片（开关开启且处于非计量网络） */
const allowImageAutoDownload = ref(false);

/** 顶部全局上传进度条：是否有正在上传的消息 */
const globalUploading = computed(() =>
  messages.value.some(
    (m) =>
      (m.sendingImage || m.sendingFile || m.sendingVoice) &&
      m.ack === false &&
      !m.failed
  )
);
const globalUploadPercent = computed(() => {
  let max = 0;
  for (const m of messages.value) {
    if (
      (m.sendingImage || m.sendingFile || m.sendingVoice) &&
      m.ack === false &&
      !m.failed
    ) {
      max = Math.max(max, m.uploadProgress ?? 0);
    }
  }
  return max;
});
/** 读取/压缩阶段(无字节进度)时顶栏展示不确定动画 */
const globalUploadIndeterminate = computed(() =>
  messages.value.some(
    (m) =>
      (m.sendingImage || m.sendingFile || m.sendingVoice) &&
      m.ack === false &&
      !m.failed &&
      m.sendPhase !== "uploading"
  )
);

const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
let viewportCleanup: (() => void) | null = null;
let uploadUnlisten: (() => void) | null = null;

/** 发送进度事件：按 nano_id 更新对应消息的阶段与上传进度 */
const applyUploadProgress = (payload: {
  nanoId: string;
  phase: UiChatMessage["sendPhase"];
  uploaded: number;
  total: number;
}) => {
  const idx = messages.value.findIndex(
    (m) => m.textMsg.nano_id === payload.nanoId
  );
  if (idx === -1) return;
  messages.value[idx].sendPhase = payload.phase;
  const percent =
    payload.total > 0
      ? Math.min(100, Math.floor((payload.uploaded / payload.total) * 100))
      : 0;
  messages.value[idx].uploadProgress = percent;
};

/** 待发送/发送失败面板的刷新信号（消息入队 / 收到 ACK 后自增触发重拉） */
const pendingRefreshSignal = ref(0);
const bumpPendingRefresh = () => void (pendingRefreshSignal.value += 1);

/* ============ 多选 / 删除 / 转发 ============ */
const {
  selectMode,
  selectedIds,
  selectedMessages,
  allSelected,
  enterSelect,
  exitSelect,
  toggle,
  toggleAll,
  removeIds,
} = useMessageSelection(messages);

const showActionSheet = ref(false);
const actionTarget = ref<UiChatMessage | null>(null);
/** 长按操作项：自己的普通消息额外提供"撤回" */
const actionActions = computed(() => {
  const msg = actionTarget.value;
  const actions: { key: string; name: string }[] = [
    { key: "multiSelect", name: t("chat.actions.multiSelect") },
    { key: "forward", name: t("chat.actions.forward") },
  ];
  if (
    msg &&
    msg.from === "mine" &&
    !msg.failed &&
    !isRecallMessage(msg.textMsg.text_type, msg.textMsg.raw)
  ) {
    actions.push({ key: "recall", name: t("chat.actions.recall") });
  }
  actions.push({ key: "delete", name: t("chat.actions.delete") });
  return actions;
});

const onLongPress = (msg: UiChatMessage) => {
  actionTarget.value = msg;
  showActionSheet.value = true;
};

/** 撤回消息：确认后清除本机原消息并发送撤回控制消息 */
const recallMessage = async (msg: UiChatMessage) => {
  try {
    await showConfirmDialog({
      title: t("chat.recallTitle"),
      message: t("chat.recallConfirm"),
      confirmButtonText: t("common.confirm"),
      cancelButtonText: t("common.cancel"),
    });
  } catch {
    return;
  }
  let recalled: TextQuicMsgVo;
  try {
    recalled = (await invoke("recall_chat_message", {
      recvUser: friendId,
      targetNanoId: msg.textMsg.nano_id,
    })) as TextQuicMsgVo;
  } catch (e) {
    console.error("撤回消息失败:", e);
    showToast({ message: t("chat.recallFailed"), icon: "fail" });
    return;
  }
  // 本地移除原消息并乐观上屏撤回提示（ACK 按本地 nano_id 归一）
  messages.value = messages.value.filter(
    (m) => m.textMsg.nano_id !== msg.textMsg.nano_id
  );
  const prevTs = messages.value.length
    ? messages.value[messages.value.length - 1].textMsg.timestamp
    : 0;
  messages.value.push({
    from: "mine",
    textMsg: recalled,
    ack: false,
    failed: false,
    showTime: needTimeDivider(prevTs, recalled.timestamp),
    senderUuid: meUuid.value,
  });
  nextTick(() => scrollToBottom(true));
};

const deleteSelected = async () => {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  try {
    await showConfirmDialog({
      title: t("chat.deleteTitle"),
      message: t("chat.deleteConfirm", { count: ids.length }),
      confirmButtonText: t("common.confirm"),
      cancelButtonText: t("common.cancel"),
    });
  } catch {
    return;
  }
  try {
    await invoke("delete_chat_record", { nanoIdList: ids });
  } catch (e) {
    console.error("删除消息失败:", e);
    showToast({ message: t("chat.deleteFailed"), icon: "fail" });
    return;
  }
  messages.value = messages.value.filter(
    (m) => !ids.includes(m.textMsg.nano_id)
  );
  removeIds(ids);
  exitSelect();
};

const showForward = ref(false);
const openForward = () => {
  if (selectedMessages.value.length === 0) return;
  showForward.value = true;
};

/** 多选复制: 仅复制文本消息(图片/文件/语音跳过), 没有文字时提示 */
const copySelected = async () => {
  const text = collectCopyableText(selectedMessages.value);
  if (!text) {
    showToast(t("chat.noCopyableText"));
    return;
  }
  try {
    await copyTextToClipboard(text);
    showToast({ message: t("chat.copySuccess"), icon: "success" });
    exitSelect();
  } catch (e) {
    console.error("复制消息失败:", e);
    showToast({ message: t("chat.copyFailed"), icon: "fail" });
  }
};

const onActionSelect = (action: { key?: string; name: string }) => {
  const msg = actionTarget.value;
  showActionSheet.value = false;
  if (!msg) return;
  if (action.key === "multiSelect") {
    enterSelect(msg);
  } else if (action.key === "forward") {
    enterSelect(msg);
    openForward();
  } else if (action.key === "recall") {
    recallMessage(msg);
  } else if (action.key === "delete") {
    enterSelect(msg);
    deleteSelected();
  }
};

const onForwardConfirm = async (payload: {
  recv: string;
  isGroup: boolean;
  name: string;
}) => {
  const list = selectedMessages.value.map((m) => m.textMsg);
  if (list.length === 0) return;
  try {
    await invoke("forward_chat_messages", {
      messages: list,
      targetRecv: payload.recv,
      targetGroup: payload.isGroup,
    });
    showToast({
      message: t("chat.forwardSuccess", { name: payload.name }),
      icon: "success",
    });
    if (!payload.isGroup && payload.recv === friendId) reloadFirstPage();
    exitSelect();
  } catch (e) {
    console.error("转发消息失败:", e);
    showToast({ message: t("chat.forwardFailed"), icon: "fail" });
  }
};

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
    friendInfo.user_type = data.friend_user_type ?? undefined;
    return;
  } catch {
    // fallthrough to local session
  }
  try {
    const sessions = (await invoke(
      "get_chat_session_from_store"
    )) as ChatSessionVo[];
    const session = sessions.find(
      (s) => s.send_user === friendId || s.recv_user === friendId
    );
    if (session) {
      friendInfo.name = session.friend_name || "";
      friendInfo.icon = session.friend_icon || "";
      friendInfo.user_type = session.friend_user_type ?? undefined;
    }
  } catch {
    // ignore
  }
};

/** 解析图片 bizId，并按需自动下载（发送方本地图片恒解析；对方图片受网络/开关控制） */
const resolveImageUrl = async (
  msg: TextQuicMsgVo,
  isMine: boolean
): Promise<string | null> => {
  const bizId = parsePrivateImageBizId(msg.raw);
  if (!bizId) return null;
  if (!isMine && !allowImageAutoDownload.value) return null;
  return loadImageUrl(bizId, msg.nano_id);
};

const imageBizIdOf = (msg: TextQuicMsgVo): string | undefined =>
  parsePrivateImageBizId(msg.raw) || undefined;

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
      (m) =>
        m.text_type !== MSG_TYPE_RECALL_SUCCESS &&
        m.text_type !== MSG_TYPE_RECALL_FAILURE &&
        !isTransientMessageType(m.text_type)
    );
    const chatMessages: UiChatMessage[] = await Promise.all(
      list.map(async (item, index, arr) => {
        const msg = makeUiMessage(item, index, arr);
        if (isImageType(item.text_type)) {
          msg.imageBizId = imageBizIdOf(item);
          msg.imageUrl = await resolveImageUrl(item, msg.from === "mine");
        }
        return msg;
      })
    );

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
    console.error("加载消息失败:", e);
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
  if (!el) return;
  isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 40;
  if (
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

/** 软键盘弹出/收起改变可视高度后：原本就在底部时保持贴底 */
const pinToBottomOnViewportChange = () => {
  if (isAtBottom.value) scrollToBottom(false);
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
    ui.imageBizId = imageBizIdOf(msg);
    ui.imageUrl = await resolveImageUrl(msg, ui.from === "mine");
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
    if (friendId === meUuid.value) {
      // 自己给自己发消息：纯本地落库，不经过服务端，避免 self-echo 回推导致重复渲染
      const stored = await invoke<TextQuicMsgVo>("send_self_text_msg", {
        textQuicMsg: textMsg,
      });
      clearAckTimer(textMsg.nano_id);
      const idx = messages.value.findIndex(
        (m) => m.textMsg.nano_id === textMsg.nano_id
      );
      if (idx !== -1) {
        messages.value[idx].textMsg = stored;
        messages.value[idx].ack = true;
      }
      return;
    }
    await invoke("send_text_msg", { textQuicMsg: textMsg });
  } catch (e) {
    console.error("发送失败:", e);
    const idx = messages.value.findIndex(
      (m) => m.textMsg.nano_id === textMsg.nano_id
    );
    if (idx !== -1) messages.value[idx].failed = true;
    showToast({ message: t("chat.sendFailed"), icon: "fail" });
  } finally {
    bumpPendingRefresh();
  }
};

const selectAndSend = async (
  media: "image" | "file",
  type: number,
  command: string
) => {
  try {
    const filters = [
      {
        name: media === "image" ? "Images" : "Files",
        extensions:
          media === "image"
            ? await getImageExtensions()
            : await getAllFileExtensions(),
      },
    ];
    const filePaths = await selectFile(false, false, filters);
    if (!filePaths || filePaths.length === 0) return;

    let filePath = filePaths[0];

    // 先上屏：选择后立即展示气泡与进度(读取/压缩/上传阶段均有反馈)
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
      uploadProgress: 0,
      sendPhase: "reading",
    };
    if (media === "image") {
      ui.sendingImage = true;
      if (!filePath.startsWith("content://")) {
        ui.imageUrl = convertPathToTauriUrl(filePath);
      }
    } else {
      ui.sendingFile = true;
    }
    messages.value.push(ui);
    await nextTick();
    scrollToBottom(true);

    const patch = (p: Partial<UiChatMessage>) => {
      const i = messages.value.findIndex(
        (m) => m.textMsg.nano_id === textMsg.nano_id
      );
      if (i !== -1) Object.assign(messages.value[i], p);
    };

    // 读取 content:// → 临时文件(此阶段气泡/顶栏展示 reading 动画)
    if (filePath.startsWith("content://")) {
      try {
        const { tempPath, preview } = await resolveContentToTempFile(filePath);
        filePath = tempPath;
        textMsg.raw = tempPath;
        if (media === "image" && preview) patch({ imageUrl: preview });
      } catch (e) {
        console.error("读取文件失败:", e);
        patch({
          failed: true,
          sendingImage: false,
          sendingFile: false,
          sendPhase: undefined,
          uploadProgress: undefined,
        });
        showToast({ message: t("chat.readFileFailed"), icon: "fail" });
        return;
      }
    }

    // 大小预校验：超限移除气泡并提示
    const limit = media === "image" ? UPLOAD_LIMITS.image : UPLOAD_LIMITS.file;
    const size = await getLocalFileSize(filePath);
    if (size > limit) {
      const i = messages.value.findIndex(
        (m) => m.textMsg.nano_id === textMsg.nano_id
      );
      if (i !== -1) messages.value.splice(i, 1);
      showToast({
        message: t(
          media === "image" ? "chat.imageTooLarge" : "chat.fileTooLarge",
          { limit: Math.floor(limit / (1024 * 1024)) }
        ),
        icon: "fail",
      });
      return;
    }

    try {
      await invoke(command, { textQuicMsg: textMsg });
      // 上传/发送完成后才开始等待服务端 ACK，避免上传耗时被误判为超时
      startAckTimer(textMsg.nano_id);
    } catch (e) {
      console.error("发送媒体失败:", e);
      patch({
        failed: true,
        sendingImage: false,
        sendingFile: false,
        sendPhase: undefined,
        uploadProgress: undefined,
      });
      const errText = typeof e === "string" ? e : (e as Error)?.message;
      showToast({
        message:
          errText ||
          (media === "image"
            ? t("chat.sendImageFailed")
            : t("chat.sendFileFailed")),
        icon: "fail",
      });
    } finally {
      bumpPendingRefresh();
    }
  } catch (e) {
    console.error("选择文件失败:", e);
  }
};

const sendImage = () =>
  selectAndSend("image", MSG_TYPE_IMAGE, "send_image_msg");
const sendFile = () => selectAndSend("file", 3, "send_file_msg");

/* ============ 语音消息 ============ */
const showVoiceRecord = ref(false);
const openVoiceRecord = () => {
  showVoiceRecord.value = true;
};

/** 录音完成 → 先上屏(展示进度)再上传发送；成功后等待 ACK */
const sendVoice = async (result: VoiceRecordingResult) => {
  const textMsg: TextQuicMsgVo = {
    nano_id: genNanoId(),
    text_type: MSG_TYPE_VOICE,
    raw: result.path,
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
    uploadProgress: 0,
    sendPhase: "reading",
    sendingVoice: true,
    voiceDuration: result.duration,
  };
  messages.value.push(ui);
  await nextTick();
  scrollToBottom(true);

  const patch = (p: Partial<UiChatMessage>) => {
    const i = messages.value.findIndex(
      (m) => m.textMsg.nano_id === textMsg.nano_id
    );
    if (i !== -1) Object.assign(messages.value[i], p);
  };

  try {
    await invoke("send_voice_msg", {
      textQuicMsg: textMsg,
      duration: result.duration,
    });
    patch({ sendingVoice: false });
    startAckTimer(textMsg.nano_id);
  } catch (e) {
    console.error("发送语音失败:", e);
    patch({
      failed: true,
      sendingVoice: false,
      sendPhase: undefined,
      uploadProgress: undefined,
    });
    const errText = typeof e === "string" ? e : (e as Error)?.message;
    showToast({ message: errText || t("chat.voice.failed"), icon: "fail" });
  } finally {
    bumpPendingRefresh();
  }
};

/** 失败消息重发：优先走 Rust 补发，若不存在发送记录则直接重发 */
const handleRetry = async (msg: UiChatMessage) => {
  const idx = messages.value.findIndex(
    (m) => m.textMsg.nano_id === msg.textMsg.nano_id
  );
  const update = (failed: boolean, ack?: boolean | undefined) => {
    if (idx !== -1) {
      messages.value[idx].failed = failed;
      if (ack !== undefined) messages.value[idx].ack = ack;
    }
  };
  update(false, false);
  if (msg.textMsg.text_type === MSG_TYPE_FILE && idx !== -1) {
    messages.value[idx].sendingFile = true;
  }
  if (msg.textMsg.text_type === MSG_TYPE_VOICE && idx !== -1) {
    messages.value[idx].sendingVoice = true;
  }
  try {
    await invoke("retry_send_msg", { sendId: msg.textMsg.nano_id });
    startAckTimer(msg.textMsg.nano_id);
    bumpPendingRefresh();
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
    if (msg.textMsg.text_type === MSG_TYPE_VOICE) {
      await invoke("send_voice_msg", {
        textQuicMsg: msg.textMsg,
        duration: msg.voiceDuration || 0,
      });
    } else if (command) {
      await invoke(command, { textQuicMsg: msg.textMsg });
    } else {
      throw new Error("不支持的类型");
    }
    startAckTimer(msg.textMsg.nano_id);
  } catch (e) {
    console.error("重发失败:", e);
    update(true, undefined);
    showToast({ message: t("chat.resendFailed"), icon: "fail" });
  } finally {
    bumpPendingRefresh();
  }
};

/* ============ 实时消息 ============ */

watch(textMessage, async (msg) => {
  if (!msg) return;
  if (msg.text_type === MSG_TYPE_RECALL_SUCCESS) {
    bumpPendingRefresh();
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === msg.raw);
    if (idx !== -1) {
      clearAckTimer(msg.raw);
      messages.value[idx].ack = true;
      messages.value[idx].failed = false;
      // 服务端返回的 nano_id 归一，避免后续撤回/删除/已读用本地 id 查不到
      if (msg.nano_id) messages.value[idx].textMsg.nano_id = msg.nano_id;
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
    bumpPendingRefresh();
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === msg.raw);
    if (idx !== -1) messages.value[idx].failed = true;
    return;
  }
  // 自己其他端发送的消息(self-echo)：send_user=我, recv_user=好友。
  // 与移动端自己发送后 ACK 刷新的路径一致——直接重拉本地 sqlite
  // (双向查询已包含 self-echo 消息)，避免依赖实时 push 的时序问题。
  if (msg.send_user === meUuid.value && msg.recv_user === friendId) {
    reloadFirstPage();
    nextTick(() => scrollToBottom(true));
    return;
  }
  // 对端撤回消息：被撤回的原消息已在本地库删除，重拉聊天记录以移除原消息并显示撤回提示
  if (isRecallMessage(msg.text_type, msg.raw)) {
    reloadFirstPage();
    nextTick(() => scrollToBottom(true));
    invoke("mark_read_chat_session", { friendUuid: friendId }).catch(() => {});
    return;
  }
  // 瞬态消息(12-15/100)走独立事件 call_control/webrtc_signal，不应经 text_message 进入列表
  if (isTransientMessageType(msg.text_type)) return;
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
  allowImageAutoDownload.value = await shouldAutoDownloadImage();
  await loadMessages(1);
  markReadSession();
  invoke("add_user_map", {
    map: { current_session_friend: friendId },
  }).catch(() => {});

  viewportCleanup = attachViewportHeight(
    () => chatPageRef.value,
    pinToBottomOnViewportChange
  );
  listenChatFileUploadProgress(applyUploadProgress)
    .then((fn) => {
      uploadUnlisten = fn;
    })
    .catch(() => {});
});

onUnmounted(() => {
  ackTimers.forEach((t) => clearTimeout(t));
  ackTimers.clear();
  viewportCleanup?.();
  uploadUnlisten?.();
  uploadUnlisten = null;
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

const friendTools: InputTool[] = [
  "emoji",
  "image",
  "file",
  "voice",
  "audio",
  "video",
];
const selfTools: InputTool[] = ["emoji", "image"];

/** 点击消息头像：自己→我的资料，对方→好友资料卡 */
const handleAvatarClick = ({
  uuid,
  isMine,
}: {
  uuid: string;
  isMine: boolean;
}) => {
  if (!uuid) return;
  if (isMine || uuid === meUuid.value) {
    router.push("/profile");
  } else {
    router.push(`/friends/detail/${uuid}`);
  }
};
</script>

<template>
  <div class="chat-page" ref="chatPageRef" :style="chatBackgroundStyle">
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
        :alt="t('chat.avatar')"
        @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
      />
      <div class="header-info">
        <span class="header-name">{{
          isSelf ? t("chats.selfChatName") : friendInfo.name || friendId
        }}</span>
        <UserTypeTag v-if="!isSelf" :type="friendInfo.user_type" />
      </div>
      <div class="header-actions">
        <button
          v-if="!isSelf"
          class="header-more"
          :aria-label="t('chat.friendSettings')"
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

    <div v-if="globalUploading" class="global-upload-bar">
      <div
        v-if="globalUploadIndeterminate"
        class="global-upload-indeterminate"
      ></div>
      <div
        v-else
        class="global-upload-progress"
        :style="{ width: globalUploadPercent + '%' }"
      ></div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>{{ t("common.loadingDots") }}</p>
    </div>

    <div v-else ref="containerRef" class="message-container" @scroll="onScroll">
      <div v-if="loadingMore" class="loading-more">
        <div class="loading-spinner small"></div>
      </div>
      <div v-if="!hasMore && messages.length > 0" class="no-more">
        {{ t("chat.noMoreMessages") }}
      </div>
      <MessageList
        mode="single"
        :messages="messages"
        :my-avatar="myAvatar || DEFAULT_AVATAR"
        :peer-avatar="chatAvatar || DEFAULT_AVATAR"
        :peer-name="
          isSelf ? t('chats.selfChatName') : friendInfo.name || friendId
        "
        :fallback-avatar="DEFAULT_AVATAR"
        :my-uuid="meUuid"
        :select-mode="selectMode"
        :selected-ids="selectedIds"
        :auto-download="allowImageAutoDownload"
        @preview="handlePreview"
        @retry="handleRetry"
        @avatar-click="handleAvatarClick"
        @long-press="onLongPress"
        @toggle-select="toggle"
      />
    </div>

    <template v-if="selectMode">
      <MessageSelectionBar
        :count="selectedIds.length"
        :all-selected="allSelected"
        @cancel="exitSelect"
        @toggle-all="toggleAll"
        @copy="copySelected"
        @forward="openForward"
        @delete="deleteSelected"
      />
    </template>
    <template v-else>
      <PendingSendBar
        v-if="!loading"
        :friend-uuid="friendId"
        :refresh-signal="pendingRefreshSignal"
      />

      <MessageInputBar
        v-if="!loading"
        v-model="inputText"
        :tools="isSelf ? selfTools : friendTools"
        :placeholder="t('chat.inputPlaceholder')"
        @send="sendText"
        @pick-image="sendImage"
        @pick-file="sendFile"
        @record-voice="openVoiceRecord"
        @call="handleStartCall"
      />

      <VoiceRecordOverlay v-model:show="showVoiceRecord" @send="sendVoice" />
    </template>

    <van-action-sheet
      v-model:show="showActionSheet"
      :actions="actionActions"
      :cancel-text="t('common.cancel')"
      @select="onActionSelect"
    />

    <ForwardPicker
      v-model:show="showForward"
      :count="selectedIds.length"
      @confirm="onForwardConfirm"
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
.no-more {
  display: flex;
  justify-content: center;
  padding: 8px;
  font-size: 12px;
  color: var(--text-placeholder);
}
.global-upload-bar {
  height: 3px;
  width: 100%;
  background: rgba(64, 150, 255, 0.15);
  overflow: hidden;
  flex-shrink: 0;
}
.global-upload-progress {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #4096ff, #69b1ff, #4096ff);
  background-size: 200% 100%;
  transition: width 0.25s ease;
  animation: global-upload-shimmer 1.2s linear infinite;
}
.global-upload-indeterminate {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, #4096ff, #69b1ff, #4096ff);
  border-radius: 2px;
  animation: global-upload-slide 1.1s ease-in-out infinite;
}
@keyframes global-upload-slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(260%);
  }
}
@keyframes global-upload-shimmer {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
