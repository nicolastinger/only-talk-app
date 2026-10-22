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
import { useChatBackgroundStore } from "@/stores/chatBackground";
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
import { UPLOAD_LIMITS } from "@workspace/types";
import { DEFAULT_AVATAR } from "@/stores/user";
import { useMyAvatar } from "@/hooks/useMyAvatar";
import type { TextQuicMsgVo, GroupVo } from "@workspace/types";
import type { UiChatMessage } from "@/chat/types";
import {
  MSG_TYPE_GROUP_IMAGE,
  MSG_TYPE_GROUP_TEXT,
  MSG_TYPE_GROUP_FILE,
  MSG_TYPE_GROUP_VOICE,
  MSG_TYPE_RECALL_SUCCESS,
  MSG_TYPE_RECALL_FAILURE,
  RELOAD_ON_ACK_TYPES,
} from "@/chat/messageTypes";
import {
  isRecallMessage,
  isTransientMessageType,
  needTimeDivider,
  parseGroupImageBizId,
} from "@/chat/messageParse";
import { loadImageUrl } from "@/chat/media";
import { genNanoId } from "@/chat/id";
import { useMessageSelection } from "@/chat/useMessageSelection";
import type { VoiceRecordingResult } from "@/chat/useVoiceRecorder";
import MessageList from "@/components/chat/MessageList.vue";
import MessageInputBar from "@/components/chat/MessageInputBar.vue";
import VoiceRecordOverlay from "@/components/chat/VoiceRecordOverlay.vue";
import ImagePreviewer from "@/components/chat/ImagePreviewer.vue";
import MessageSelectionBar from "@/components/chat/MessageSelectionBar.vue";
import ForwardPicker from "@/components/chat/ForwardPicker.vue";
import { useI18n } from "@/i18n";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
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
// 聊天背景(仅客户端): 有自定义背景时拉伸铺满, 否则保持主题背景
const { activeUrl: chatBackgroundUrl, refresh: refreshChatBackground } =
  useChatBackgroundStore();
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

const { textMessage } = useMessageApi(() => groupId, undefined, true);
const { groupAckMessage } = useGroupMessageAck(groupId);
const { getAvatarUrl } = useAvatar();
const { myAvatar, ensureMyAvatar } = useMyAvatar(() => meUuid.value);

const groupAvatar = ref<string | null>(null);
/** 当前是否允许自动下载群成员发来的图片（开关开启且处于非计量网络） */
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

/** 群消息没有服务端逐成员回执，发送命令成功即视为已送达
 *  标记 ack=true 让绿点出现（同 PC 已送达语义），并清除等待超时定时器 */
const markGroupDelivered = (nanoId: string) => {
  const idx = messages.value.findIndex((m) => m.textMsg.nano_id === nanoId);
  if (idx !== -1) {
    clearAckTimer(nanoId);
    messages.value[idx].ack = true;
    messages.value[idx].failed = false;
    messages.value[idx].sendingImage = false;
    messages.value[idx].sendingFile = false;
    messages.value[idx].sendingVoice = false;
  }
};

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

/** 撤回群消息：确认后清除本机原消息并发送撤回控制消息 */
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
    recalled = (await invoke("recall_group_chat_message", {
      groupId,
      targetNanoId: msg.textMsg.nano_id,
    })) as TextQuicMsgVo;
  } catch (e) {
    console.error("撤回群消息失败:", e);
    showToast({ message: t("chat.recallFailed"), icon: "fail" });
    return;
  }
  // 本地移除原消息并乐观上屏撤回提示（群 ACK 按本地 nano_id 归一）
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
    await invoke("delete_group_chat_record", { nanoIdList: ids, groupId });
  } catch (e) {
    console.error("删除群消息失败:", e);
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
    if (payload.isGroup && payload.recv === groupId) reloadFirstPage();
    exitSelect();
  } catch (e) {
    console.error("转发消息失败:", e);
    showToast({ message: t("chat.forwardFailed"), icon: "fail" });
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

/** 解析群图片 bizId，并按需自动下载（发送方本地图片恒解析；他人图片受网络/开关控制） */
const resolveGroupImageUrl = async (
  msg: TextQuicMsgVo,
  isMine: boolean
): Promise<string | null> => {
  const bizId = parseGroupImageBizId(msg.raw);
  if (!bizId) return null;
  if (!isMine && !allowImageAutoDownload.value) return null;
  return loadImageUrl(bizId, msg.nano_id);
};

const groupImageBizIdOf = (msg: TextQuicMsgVo): string | undefined =>
  parseGroupImageBizId(msg.raw) || undefined;

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
        m.text_type !== MSG_TYPE_RECALL_FAILURE &&
        !isTransientMessageType(m.text_type)
    );
    const chatMessages: UiChatMessage[] = [];
    for (let i = 0; i < list.length; i++) {
      const ui = makeUiMessage(list[i], i, list);
      if (isGroupImage(list[i].text_type)) {
        ui.imageBizId = groupImageBizIdOf(list[i]);
        ui.imageUrl = await resolveGroupImageUrl(list[i], ui.from === "mine");
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
  if (isGroupImage(msg.text_type)) {
    ui.imageBizId = groupImageBizIdOf(msg);
    ui.imageUrl = await resolveGroupImageUrl(msg, ui.from === "mine");
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
    markGroupDelivered(textMsg.nano_id);
  } catch (e) {
    console.error("群消息发送失败:", e);
    const idx = messages.value.findIndex(
      (m) => m.textMsg.nano_id === textMsg.nano_id
    );
    if (idx !== -1) messages.value[idx].failed = true;
    showToast({ message: t("chat.sendFailed"), icon: "fail" });
  }
};

const selectAndSendGroup = async (
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
      markGroupDelivered(textMsg.nano_id);
    } catch (e) {
      console.error("群媒体发送失败:", e);
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
    }
  } catch (e) {
    console.error("选择文件失败:", e);
  }
};

const sendGroupImage = () =>
  selectAndSendGroup("image", MSG_TYPE_GROUP_IMAGE, "send_group_image_msg");
const sendGroupFile = () =>
  selectAndSendGroup("file", MSG_TYPE_GROUP_FILE, "send_group_file_msg");

/* ============ 群语音消息 ============ */
const showVoiceRecord = ref(false);
const openVoiceRecord = () => {
  showVoiceRecord.value = true;
};

const sendGroupVoice = async (result: VoiceRecordingResult) => {
  const textMsg: TextQuicMsgVo = {
    nano_id: genNanoId(),
    text_type: MSG_TYPE_GROUP_VOICE,
    raw: result.path,
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
    await invoke("send_group_voice_msg", {
      textQuicMsg: textMsg,
      duration: result.duration,
    });
    markGroupDelivered(textMsg.nano_id);
  } catch (e) {
    console.error("群语音发送失败:", e);
    patch({
      failed: true,
      sendingVoice: false,
      sendPhase: undefined,
      uploadProgress: undefined,
    });
    const errText = typeof e === "string" ? e : (e as Error)?.message;
    showToast({ message: errText || t("chat.voice.failed"), icon: "fail" });
  }
};

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
  } else if (type === MSG_TYPE_GROUP_FILE) {
    ui.sendingFile = true;
  } else if (type === MSG_TYPE_GROUP_VOICE) {
    ui.sendingVoice = true;
    ui.voiceDuration = msg.voiceDuration;
  }
  messages.value.push(ui);
  await nextTick();
  scrollToBottom(true);

  const command =
    type === MSG_TYPE_GROUP_TEXT
      ? "send_group_text_msg"
      : type === MSG_TYPE_GROUP_IMAGE
      ? "send_group_image_msg"
      : "send_group_file_msg";
  try {
    if (type === MSG_TYPE_GROUP_VOICE) {
      await invoke("send_group_voice_msg", {
        textQuicMsg: textMsg,
        duration: msg.voiceDuration || 0,
      });
    } else {
      await invoke(command, { textQuicMsg: textMsg });
    }
    markGroupDelivered(textMsg.nano_id);
  } catch (e) {
    console.error("群消息重发失败:", e);
    const i = messages.value.findIndex(
      (m) => m.textMsg.nano_id === textMsg.nano_id
    );
    if (i !== -1) {
      messages.value[i].failed = true;
      messages.value[i].sendingImage = false;
      messages.value[i].sendingFile = false;
      messages.value[i].sendingVoice = false;
    }
    showToast({ message: t("chat.resendFailed"), icon: "fail" });
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
  // 群内撤回消息：被撤回的原消息已在本地库删除，重拉聊天记录以移除原消息并显示撤回提示
  if (isRecallMessage(msg.text_type, msg.raw)) {
    reloadFirstPage();
    nextTick(() => scrollToBottom(true));
    invoke("mark_read_chat_session", { friendUuid: groupId }).catch(() => {});
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
    // 服务端返回的 nano_id 归一，避免后续撤回/删除用本地 id 查不到
    if (ack.nano_id) messages.value[idx].textMsg.nano_id = ack.nano_id;
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

const goGroupSettings = () => router.push(`/chats/group-settings/${groupId}`);

/** 点击消息头像：自己→我的资料，群成员→用户资料卡 */
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

const markReadSession = () => {
  invoke("mark_read_chat_session", { friendUuid: groupId }).catch(() => {});
};

onMounted(async () => {
  refreshChatBackground().catch(() => {});
  meUuid.value = await getMyUuid();
  if (!meUuid.value) {
    router.replace("/login");
    return;
  }
  // 列表页点击进入时把群名/头像/人数通过 query 带过来, 避免异步拉取期间
  // 顶部先闪显 groupId 占位符
  const qName = route.query.name;
  const qIcon = route.query.icon;
  const qMc = route.query.mc;
  if (typeof qName === "string" && qName) groupInfo.group_name = qName;
  if (typeof qMc === "string") {
    const n = Number(qMc);
    if (Number.isFinite(n) && n > 0) groupInfo.member_count = n;
  }
  if (typeof qIcon === "string" && qIcon) groupAvatar.value = qIcon;
  await loadGroupInfo();
  await loadAvatars();
  allowImageAutoDownload.value = await shouldAutoDownloadImage();
  await loadMessages(1);
  markReadSession();
  invoke("add_user_map", {
    map: { current_session_friend: groupId },
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
  <div
    class="group-chat-page"
    ref="chatPageRef"
    :style="chatBackgroundStyle"
  >
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
        :alt="t('chat.groupAvatar')"
        @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
      />
      <div class="header-info">
        <span class="header-name">{{
          groupInfo.group_name || t("chats.groupChat")
        }}</span>
        <span v-if="groupInfo.member_count" class="header-count">{{
          t("chat.memberCountShort", { count: groupInfo.member_count })
        }}</span>
      </div>
      <button
        class="more-btn"
        :aria-label="t('chat.groupSettings')"
        @click="goGroupSettings"
      >
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
        mode="group"
        :messages="messages"
        :my-avatar="myAvatar || DEFAULT_AVATAR"
        :peer-avatar="groupAvatar || DEFAULT_AVATAR"
        :fallback-avatar="DEFAULT_AVATAR"
        :member-map="memberMap"
        :avatar-url-map="avatarUrlMap"
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
        @forward="openForward"
        @delete="deleteSelected"
      />
    </template>
    <MessageInputBar
      v-if="!loading && !selectMode"
      v-model="inputText"
      :tools="['emoji', 'image', 'file', 'voice']"
      :placeholder="t('chat.inputPlaceholder')"
      @send="sendGroupText"
      @pick-image="sendGroupImage"
      @pick-file="sendGroupFile"
      @record-voice="openVoiceRecord"
    />

    <VoiceRecordOverlay
      v-model:show="showVoiceRecord"
      @send="sendGroupVoice"
    />

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
