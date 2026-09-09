<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import {
  showToast,
  showConfirmDialog,
  PullRefresh,
  SwipeCell,
  Badge,
  Empty,
} from "vant";
import { clearAllUnreadSessions, get_friend_list, get_group_list } from "@workspace/services";
import { useChatSessions } from "@/hooks/useChatSession";
import { useUnreadStore } from "@/stores/unread";
import { useAnnouncementStore } from "@/stores/announcement";
import { useAvatar } from "@/hooks/useAvatar";
import { getMyUuid } from "@/utils/api";
import { formatMessageTime, getMessagePreview } from "@/utils/time";
import { DEFAULT_AVATAR } from "@/stores/user";
import type { ChatSessionVo, FriendVo, GroupListItemVo } from "@workspace/types";

const router = useRouter();
const { sessions, refresh } = useChatSessions();
const { hideSession } = useUnreadStore();
const { unreadCount: annUnread, fetchList: fetchAnnouncements, openList: openAnnouncements } =
  useAnnouncementStore();
const { getAvatarUrl } = useAvatar();
const refreshing = ref(false);
const searchText = ref("");
const debouncedSearch = ref("");

const avatarMap = ref<Record<string, string | null>>({});
const friendMap = ref<Record<string, FriendVo>>({});
const groupMap = ref<Record<string, GroupListItemVo>>({});

let searchTimer: ReturnType<typeof setTimeout> | null = null;

const openAnnouncementCenter = async () => {
  await fetchAnnouncements();
  openAnnouncements();
};

const isSelfChat = (item: ChatSessionVo) => item.send_user === item.recv_user;

const isGroupChat = (item: ChatSessionVo) => item.session_type === 2;

const peerIdOf = (item: ChatSessionVo): string => item.send_user || "";

const groupIdOf = (item: ChatSessionVo): string =>
  isGroupChat(item) ? item.group_id || item.send_user || "" : "";

const groupInfoOf = (item: ChatSessionVo): GroupListItemVo | undefined => {
  const gid = groupIdOf(item);
  return gid ? groupMap.value[gid] : undefined;
};

// 群会话名称/头像优先取 sqlite join 的 friend_name/friend_icon（离线可用），
// 缺失时（本地 group_info 尚未同步）用服务端群列表兜底
const sessionIconOf = (s: ChatSessionVo): string => {
  if (isSelfChat(s)) return "";
  if (isGroupChat(s)) {
    return s.friend_icon || groupInfoOf(s)?.avatar || "";
  }
  return s.friend_icon || "";
};

const loadGroups = async () => {
  try {
    const list = (await get_group_list()) || [];
    const map: Record<string, GroupListItemVo> = {};
    for (const g of list) map[g.group_uuid] = g;
    groupMap.value = map;
    await resolveAvatars();
  } catch (e) {
    console.error("加载群列表失败:", e);
  }
};

const loadFriends = async () => {
  try {
    const list = (await get_friend_list()) || [];
    const map: Record<string, FriendVo> = {};
    for (const f of list) map[f.friend_id] = f;
    friendMap.value = map;
    const icons = [
      ...new Set(list.map((f) => f.friend_icon).filter((i) => !!i)),
    ];
    await Promise.all(
      icons
        .filter((icon) => avatarMap.value[icon] === undefined)
        .map(async (icon) => {
          const url = await getAvatarUrl(icon);
          avatarMap.value[icon] = url;
        })
    );
  } catch (e) {
    console.error("加载好友信息失败:", e);
  }
};

const getDisplayName = (item: ChatSessionVo) => {
  if (isSelfChat(item)) return "我的笔记";
  if (isGroupChat(item)) {
    if (item.friend_name) return item.friend_name;
    const group = groupInfoOf(item);
    if (group?.group_name) return group.group_name;
    return "群聊";
  }
  if (item.friend_name) return item.friend_name;
  const peer = peerIdOf(item);
  const friend = friendMap.value[peer];
  if (friend?.friend_name) return friend.friend_name;
  if (peer) return shortId(peer);
  return "未知";
};

const shortId = (id: string): string =>
  id.length > 12 ? `用户${id.slice(-6)}` : id;

const getDisplayMessage = (item: ChatSessionVo) =>
  getMessagePreview(item.text_type, item.last_message);

const isPinned = (item: ChatSessionVo) => !!(item.is_top && item.is_top > 0);

const getGroupInitial = (item: ChatSessionVo) => {
  const name = getDisplayName(item).trim();
  return name ? name.slice(0, 1).toUpperCase() : "群";
};

const iconUrlOf = (item: ChatSessionVo): string | null => {
  if (isSelfChat(item)) return null;
  const icon = isGroupChat(item)
    ? item.friend_icon || groupInfoOf(item)?.avatar
    : item.friend_icon || friendMap.value[peerIdOf(item)]?.friend_icon;
  if (icon && avatarMap.value[icon] != null) return avatarMap.value[icon];
  return null;
};

const resolveAvatars = async () => {
  const icons = new Set<string>();
  for (const s of sessions.value) {
    const icon = sessionIconOf(s);
    if (icon) icons.add(icon);
  }
  for (const g of Object.values(groupMap.value)) {
    if (g.avatar) icons.add(g.avatar);
  }
  await Promise.all(
    [...icons]
      .filter((icon) => avatarMap.value[icon] === undefined)
      .map(async (icon) => {
        const url = await getAvatarUrl(icon);
        avatarMap.value[icon] = url;
      })
  );
};

watch(
  sessions,
  () => {
    resolveAvatars();
  },
  { immediate: true }
);

watch(
  friendMap,
  () => {
    resolveAvatars();
  },
  { immediate: true }
);

watch(searchText, (val) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    debouncedSearch.value = val.trim().toLowerCase();
  }, 200);
});

onMounted(() => {
  loadFriends().catch(() => {});
  loadGroups().catch(() => {});
});

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const highlightText = (text: string): string => {
  const keyword = debouncedSearch.value;
  if (!keyword) return escapeHtml(text);
  const lower = text.toLowerCase();
  const kwLength = keyword.length;
  let result = "";
  let index = 0;
  let found = lower.indexOf(keyword);
  while (found !== -1) {
    result += escapeHtml(text.slice(index, found));
    result += `<span class="hl">${escapeHtml(
      text.slice(found, found + kwLength)
    )}</span>`;
    index = found + kwLength;
    found = lower.indexOf(keyword, index);
  }
  result += escapeHtml(text.slice(index));
  return result;
};

const sectionTab = ref(0);
const searchList = computed(() => {
  const keyword = debouncedSearch.value;
  if (!keyword) return sessions.value;
  return sessions.value.filter((s) => {
    const name = (getDisplayName(s) || "").toLowerCase();
    const message = getDisplayMessage(s).toLowerCase();
    return name.includes(keyword) || message.includes(keyword);
  });
});

const visibleSessions = computed(() =>
  searchList.value.filter((s) =>
    sectionTab.value === 1 ? isGroupChat(s) : !isGroupChat(s)
  )
);

const emptyText = computed(() => {
  if (debouncedSearch.value) return "未找到相关会话";
  return sectionTab.value === 1 ? "暂无群聊会话" : "暂无单聊会话";
});

const onRefresh = async () => {
  refreshing.value = true;
  await refresh();
  await Promise.all([loadFriends(), loadGroups()]).catch(() => {});
  refreshing.value = false;
};

const onClearAllUnread = async () => {
  try {
    await showConfirmDialog({
      title: "全部已读",
      message: "确定将所有会话标记为已读吗？",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  await clearAllUnreadSessions();
  await refresh();
  showToast({ message: "已全部标记为已读", icon: "success" });
};

const openChat = async (item: ChatSessionVo) => {
  if (item.session_type === 2) {
    const groupId = item.group_id || item.send_user;
    router.push(`/chats/group-chat/${groupId}`);
    return;
  }
  const myUuid = await getMyUuid();
  const friendUuid = isSelfChat(item)
    ? item.send_user
    : item.send_user === myUuid
    ? item.recv_user
    : item.send_user;
  router.push(`/chats/chat/${friendUuid}`);
};

const deleteSession = async (item: ChatSessionVo) => {
  try {
    await showConfirmDialog({
      title: "删除会话",
      message: "确定删除此会话吗？",
      confirmButtonText: "删除",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
    await hideSession(item);
    showToast({ message: "已隐藏，新消息将重新显示", icon: "success" });
  } catch (e) {
    if (e !== "cancel") console.error("删除会话失败:", e);
  }
};

const getAvatar = (item: ChatSessionVo) => {
  if (isSelfChat(item)) return "";
  const url = iconUrlOf(item);
  return url || DEFAULT_AVATAR;
};

const hasResolvedAvatar = (item: ChatSessionVo) => {
  if (isSelfChat(item)) return false;
  return iconUrlOf(item) != null;
};
</script>

<template>
  <div class="chats-page">
    <div class="header">
      <div class="header-top">
        <svg class="title-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
          />
        </svg>
        <div class="header-actions">
          <button
            class="hdr-btn"
            aria-label="系统公告"
            title="系统公告"
            @click="openAnnouncementCenter"
          >
            <span class="bell-wrap">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
                />
              </svg>
              <span v-if="annUnread > 0" class="bell-dot">{{
                annUnread > 99 ? "99+" : annUnread
              }}</span>
            </span>
          </button>
          <button
            class="hdr-btn"
            aria-label="全部已读"
            title="全部已读"
            @click="onClearAllUnread"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"
              />
            </svg>
          </button>
          <button class="hdr-btn" @click="router.push('/friends/search')">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
          </button>
        </div>
      </div>
      <div class="search-section">
        <div class="search-bar">
          <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索"
            class="search-input"
          />
          <button v-if="searchText" class="clear-btn" @click="searchText = ''">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="seg-tabs">
      <button
        class="seg-tab"
        :class="{ active: sectionTab === 0 }"
        @click="sectionTab = 0"
      >
        单聊
      </button>
      <button
        class="seg-tab"
        :class="{ active: sectionTab === 1 }"
        @click="sectionTab = 1"
      >
        群聊
      </button>
    </div>

    <PullRefresh
      v-model="refreshing"
      :head-height="80"
      pulling-text="下拉刷新"
      loosing-text="释放刷新"
      loading-text="加载中..."
      @refresh="onRefresh"
    >
      <div v-if="visibleSessions.length > 0" class="session-list">
        <SwipeCell v-for="item in visibleSessions" :key="item.nano_id">
          <div
            class="session-item"
            :class="{ self: isSelfChat(item) }"
            @click="openChat(item)"
          >
            <div
              class="avatar-wrapper"
              :class="{
                self: isSelfChat(item),
                group: isGroupChat(item) && !hasResolvedAvatar(item),
              }"
            >
              <img
                v-if="
                  !isSelfChat(item) &&
                  (!isGroupChat(item) || hasResolvedAvatar(item))
                "
                :src="getAvatar(item)"
                :alt="getDisplayName(item)"
                class="avatar"
                @error="
                  ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                "
              />
              <div v-else-if="isSelfChat(item)" class="avatar self-avatar">
                📝
              </div>
              <div v-else class="avatar group-avatar-fallback">
                <span class="group-initial">{{ getGroupInitial(item) }}</span>
              </div>
            </div>
            <div class="session-info">
              <div class="session-top">
                <div class="session-name-row">
                  <span v-if="isPinned(item)" class="pin-badge">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M16 9V4h1c.55 0 1-.45 1-1V2H6v1c0 .55.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1V15H19v-2c-1.66 0-3-1.34-3-3z"
                      />
                    </svg>
                  </span>
                  <span
                    class="session-name"
                    v-html="highlightText(getDisplayName(item))"
                  ></span>
                </div>
                <span class="session-time">{{
                  formatMessageTime(item.timestamp)
                }}</span>
              </div>
              <div class="session-bottom">
                <span
                  class="session-msg"
                  v-html="highlightText(getDisplayMessage(item))"
                ></span>
                <Badge
                  v-if="item.unread_count > 0"
                  :content="item.unread_count"
                  :max="99"
                />
              </div>
            </div>
          </div>
          <template #right>
            <div class="swipe-delete" @click="deleteSession(item)">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
              <span>删除</span>
            </div>
          </template>
        </SwipeCell>
      </div>
      <Empty v-else :description="emptyText">
        <template #image>
          <img
            src="@/assets/empty-state.svg"
            class="empty-state-img"
            alt="暂无内容"
          />
        </template>
      </Empty>
    </PullRefresh>
  </div>
</template>

<style scoped lang="less">
.chats-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 80px;
}

.header {
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
  padding: max(16px, env(safe-area-inset-top)) 20px 0;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.title-icon {
  width: 26px;
  height: 26px;
  color: var(--brand-blue);
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.hdr-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 21px;
    height: 21px;
  }

  .bell-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bell-dot {
    position: absolute;
    top: -6px;
    right: -10px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: var(--radius-full);
    background: var(--badge-bg);
    color: var(--badge-text);
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
    box-sizing: border-box;
  }

  &:active {
    background: var(--brand-blue-bg);
    color: var(--brand-blue);
    transform: scale(0.92);
  }
}

.search-section {
  padding-bottom: 12px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-xs);

  &:focus-within {
    border-color: var(--brand-blue);
    box-shadow: var(--shadow-glow-sm);
  }
}

.search-icon {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 14px;
  &::placeholder {
    color: var(--text-placeholder);
  }
}

.clear-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-hover);
  border: none;
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;
  svg {
    width: 14px;
    height: 14px;
  }
}

.seg-tabs {
  margin: 8px 12px 10px;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.seg-tab {
  flex: 1;
  height: 34px;
  border: none;
  border-radius: calc(var(--radius-lg) - 5px);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;

  &.active {
    background: var(--gradient-primary);
    color: #fff;
    font-weight: 600;
    box-shadow: var(--shadow-sm);
  }
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 12px 12px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: transform var(--transition-fast);

  &:active {
    transform: scale(0.98);
  }
}

.avatar-wrapper {
  flex-shrink: 0;
  padding: 2px;
  border-radius: 50%;
  background: var(--gradient-primary);
  &.self {
    padding: 0;
    background: none;
  }
  &.group {
    padding: 0;
    background: none;
  }
}

.avatar {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--card-bg);
}

.self-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.group-avatar-fallback {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-sm);

  .group-initial {
    font-size: 18px;
    font-weight: 600;
    line-height: 1;
  }
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.session-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.pin-badge {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brand-blue);

  svg {
    width: 14px;
    height: 14px;
  }
}

.session-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.hl {
  color: var(--brand-blue);
  font-weight: 600;
  background: transparent;
}

.session-time {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  margin-left: 8px;
}

.session-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.session-msg {
  font-size: 13px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

:deep(.van-badge) {
  flex-shrink: 0;
  margin-left: 8px;
}

.swipe-delete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 72px;
  height: 100%;
  background: #ef4444;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  svg {
    width: 20px;
    height: 20px;
  }
}

:deep(.van-empty) {
  padding: 60px 0;
}
:deep(.van-empty__description) {
  color: var(--text-tertiary);
}
.empty-state-img {
  width: 120px;
  height: 96px;
}
</style>
