import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  get_accept_friend_request_list,
  get_pending_invitations,
} from "@workspace/services";
import { getMyUuid, parseResponse } from "@/utils/api";
import type {
  ChatSessionVo,
  ChatSessionEvent,
  FriendRequestInfo,
  FriendRequestInfoDTO,
} from "@workspace/types";

const sortSessions = (list: ChatSessionVo[]): ChatSessionVo[] =>
  [...list].sort((a, b) => {
    if ((b.is_top || 0) !== (a.is_top || 0)) {
      return (b.is_top || 0) - (a.is_top || 0);
    }
    return b.timestamp - a.timestamp;
  });

const sessions = ref<ChatSessionVo[]>([]);
const loading = ref(false);
const chatUnread = ref(0);
const friendReq = ref(0);
const groupInvite = ref(0);

// 消息 tab 徽标：聊天未读 + 待处理好友请求 + 待处理群邀请
const chatBadge = computed(() => chatUnread.value + friendReq.value + groupInvite.value);
// 好友 tab 徽标：待处理好友请求 + 待处理群邀请
const friendBadge = computed(() => friendReq.value + groupInvite.value);

const fetchSessions = async () => {
  try {
    loading.value = true;
    const res: ChatSessionVo[] = await invoke("get_chat_session_from_store");
    sessions.value = sortSessions(res || []);
    chatUnread.value = sessions.value.reduce(
      (sum, s) => sum + (s.unread_count || 0),
      0
    );
  } catch (e) {
    console.error("加载会话列表失败:", e);
  } finally {
    loading.value = false;
  }
};

const fetchFriendCounts = async () => {
  try {
    const dto: FriendRequestInfoDTO = {};
    const res = await get_accept_friend_request_list(dto);
    const list = res?.netSuccess ? parseResponse<FriendRequestInfo[]>(res) : [];
    friendReq.value = list.filter((r) => r.accept_status === 0).length;
  } catch (e) {
    console.error("加载好友请求数失败:", e);
  }
};

const fetchGroupCounts = async () => {
  try {
    const list = await get_pending_invitations();
    groupInvite.value = (list || []).filter((i) => i.status === 1).length;
  } catch (e) {
    console.error("加载群邀请数失败:", e);
  }
};

const refreshAll = async () => {
  await Promise.all([
    fetchSessions(),
    fetchFriendCounts(),
    fetchGroupCounts(),
  ]);
};

// 隐藏会话（is_show置0），新消息到达时会重新显示
const hideSession = async (item: ChatSessionVo) => {
  try {
    await invoke("hide_chat_session", {
      sendUser: item.send_user,
      recvUser: item.recv_user,
    });
    sessions.value = sessions.value.filter(
      (s) =>
        !(s.send_user === item.send_user && s.recv_user === item.recv_user)
    );
    chatUnread.value = sessions.value.reduce(
      (sum, s) => sum + (s.unread_count || 0),
      0
    );
  } catch (e) {
    console.error("隐藏会话失败:", e);
    throw e;
  }
};

let unlisteners: UnlistenFn[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let monitorStarted = false;

const setupSessionListener = async () => {
  unlisteners.push(
    await listen<string>("chat_session", async (event) => {
      try {
        const evt: ChatSessionEvent = JSON.parse(event.payload);
        const uuid = await getMyUuid();
        if (evt.data.recv_user !== uuid) return;

        const index = sessions.value.findIndex(
          (item) =>
            item.send_user === evt.data.send_user &&
            item.recv_user === evt.data.recv_user
        );

        if (index === -1) {
          sessions.value.unshift(evt.data);
        } else if (evt.type === 0) {
          sessions.value[index] = { ...evt.data, unread_count: 0 };
        } else if (evt.type === 1) {
          sessions.value[index] = {
            ...evt.data,
            unread_count:
              sessions.value[index].unread_count + evt.data.unread_count,
          };
        }
        sessions.value = sortSessions(sessions.value);
        chatUnread.value = sessions.value.reduce(
          (sum, s) => sum + (s.unread_count || 0),
          0
        );
      } catch (e) {
        console.error("处理chat_session事件失败:", e);
      }
    })
  );
};

const setupRealtimeListeners = async () => {
  // 好友请求/群邀请被处理后，服务端通知刷新
  unlisteners.push(
    await listen<string>("friend_list_changed", () => {
      fetchFriendCounts().catch(console.error);
    })
  );
  // 断线重连/离线补拉完成后刷新未读
  unlisteners.push(await listen<string>("quic_connected", refreshAll));
  unlisteners.push(await listen<string>("quic_sync_complete", refreshAll));
};

const startMonitor = async () => {
  await refreshAll();
  await setupSessionListener();
  await setupRealtimeListeners();
  pollTimer = setInterval(refreshAll, 30000);
};

export function startUnreadMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  startMonitor().catch((e) => {
    console.error("未读监控初始化失败", e);
  });
}

export function stopUnreadMonitor() {
  unlisteners.forEach((fn) => fn());
  unlisteners = [];
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  monitorStarted = false;
}

export const useUnreadStore = () => ({
  sessions,
  loading,
  chatUnread,
  friendReq,
  groupInvite,
  chatBadge,
  friendBadge,
  refresh: refreshAll,
  hideSession,
  refreshFriendCounts: async () => {
    await Promise.all([fetchFriendCounts(), fetchGroupCounts()]);
  },
});
