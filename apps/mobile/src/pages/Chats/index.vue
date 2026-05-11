<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { showToast, showConfirmDialog, PullRefresh, SwipeCell, Badge, Empty } from "vant";
import { invoke } from "@tauri-apps/api/core";
import { useChatSessions } from "@/hooks/useChatSession";
import { useAvatar } from "@/hooks/useAvatar";
import { getMyUuid } from "@/utils/api";
import { formatMessageTime, getMessagePreview } from "@/utils/time";
import type { ChatSessionVo } from "@workspace/types";

const router = useRouter();
const { sessions, refresh } = useChatSessions();
const { getAvatarUrl } = useAvatar();
const refreshing = ref(false);
const searchText = ref("");

const avatarMap = ref<Record<string, string | null>>({});

const resolveAvatars = async () => {
  for (const s of sessions.value) {
    if (isSelfChat(s)) continue;
    const icon = s.friend_icon;
    if (!icon || avatarMap.value[icon] !== undefined) continue;
    const url = await getAvatarUrl(icon);
    avatarMap.value[icon] = url;
  }
};

watch(sessions, () => { resolveAvatars(); }, { immediate: true });

const filteredSessions = computed(() => {
  if (!searchText.value.trim()) return sessions.value;
  const keyword = searchText.value.trim().toLowerCase();
  return sessions.value.filter((s) => s.friend_name?.toLowerCase().includes(keyword));
});

const totalUnread = computed(() =>
  filteredSessions.value.reduce((sum, s) => sum + (s.unread_count || 0), 0)
);

const onRefresh = async () => {
  refreshing.value = true;
  await refresh();
  refreshing.value = false;
};

const openChat = async (item: ChatSessionVo) => {
  const myUuid = await getMyUuid();
  const friendUuid = isSelfChat(item) ? item.send_user : (item.send_user === myUuid ? item.recv_user : item.send_user);
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
    await invoke("hide_chat_session", { sendUser: item.send_user, recvUser: item.recv_user });
    sessions.value = sessions.value.filter(
      (s) => !(s.send_user === item.send_user && s.recv_user === item.recv_user)
    );
    showToast({ message: "已删除", icon: "success" });
  } catch (e) {
    if (e !== "cancel") console.error("删除会话失败:", e);
  }
};

const isSelfChat = (item: ChatSessionVo) => item.send_user === item.recv_user;

const DEFAULT_AVATAR =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiNFNUU3RUIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjM2IiByPSIxNiIgZmlsbD0iIzlDQTNBRiIvPjxwYXRoIGQ9Ik0xOCA4MmMwLTE3LjY3MyAxNC4zMjctMzIgMzItMzJzMzIgMTQuMzI3IDMyIDMyIiBmaWxsPSIjOUNBM0FGIi8+PC9zdmc+";

const getAvatar = (item: ChatSessionVo) => {
  if (isSelfChat(item)) return "";
  if (item.friend_icon && avatarMap.value[item.friend_icon]) {
    return avatarMap.value[item.friend_icon];
  }
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.friend_name || item.send_user || "user"}`;
};

const getDisplayName = (item: ChatSessionVo) => {
  if (isSelfChat(item)) return "我的笔记";
  return item.friend_name || item.send_user || "未知";
};

const getDisplayMessage = (item: ChatSessionVo) => getMessagePreview(item.text_type, item.last_message);
</script>

<template>
  <div class="chats-page">
    <div class="header">
      <div class="header-top">
        <h1 class="title">
          消息
          <span v-if="totalUnread > 0" class="total-badge">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
        </h1>
        <button class="add-btn" @click="router.push('/friends/search')">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
        </button>
      </div>
      <div class="search-section">
        <div class="search-bar">
          <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
          <input v-model="searchText" type="text" placeholder="搜索" class="search-input" />
          <button v-if="searchText" class="clear-btn" @click="searchText = ''">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>
      </div>
    </div>

    <PullRefresh v-model="refreshing" :head-height="80" pulling-text="下拉刷新" loosing-text="释放刷新" loading-text="加载中..." @refresh="onRefresh">
      <div v-if="filteredSessions.length > 0" class="session-list">
        <SwipeCell v-for="item in filteredSessions" :key="item.nano_id">
          <div class="session-item" :class="{ self: isSelfChat(item) }" @click="openChat(item)">
            <div class="avatar-wrapper">
              <img v-if="!isSelfChat(item)" :src="getAvatar(item) || DEFAULT_AVATAR" :alt="getDisplayName(item)" class="avatar" @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR" />
              <div v-else class="avatar self-avatar">📝</div>
            </div>
            <div class="session-info">
              <div class="session-top">
                <span class="session-name">{{ getDisplayName(item) }}</span>
                <span class="session-time">{{ formatMessageTime(item.timestamp) }}</span>
              </div>
              <div class="session-bottom">
                <span class="session-msg">{{ getDisplayMessage(item) }}</span>
                <Badge v-if="item.unread_count > 0" :content="item.unread_count" :max="99" />
              </div>
            </div>
          </div>
          <template #right>
            <div class="swipe-delete" @click="deleteSession(item)">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
              <span>删除</span>
            </div>
          </template>
        </SwipeCell>
      </div>
      <Empty v-else description="暂无聊天消息">
        <template #image>
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:80px;height:80px;color:var(--border-medium)"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" /></svg>
        </template>
      </Empty>
    </PullRefresh>

    <div class="fab" @click="router.push('/friends/search')">
      <svg viewBox="0 0 24 24" fill="white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
    </div>
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
  padding: 16px 20px 0;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.total-badge {
  font-size: 14px; font-weight: 600;
  min-width: 24px; height: 24px; padding: 0 8px;
  background: var(--badge-bg); color: var(--badge-text);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}

.add-btn {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-xs);

  svg { width: 22px; height: 22px; }

  &:active {
    background: var(--blue-50);
    color: var(--brand-blue);
    border-color: var(--brand-blue);
  }
}

.search-section { padding-bottom: 12px; }

.search-bar {
  display: flex; align-items: center; gap: 10px;
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

.search-icon { width: 18px; height: 18px; color: var(--text-tertiary); flex-shrink: 0; }

.search-input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text-primary); font-size: 14px;
  &::placeholder { color: var(--text-placeholder); }
}

.clear-btn {
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-hover); border: none; border-radius: 50%;
  color: var(--text-tertiary); cursor: pointer;
  svg { width: 14px; height: 14px; }
}

.session-list { padding: 4px 0; }

.session-item {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 20px; cursor: pointer;
  transition: background var(--transition-fast);
  &:active { background: var(--surface-hover); }
}

.avatar-wrapper { position: relative; flex-shrink: 0; }

.avatar {
  width: 52px; height: 52px;
  border-radius: 50%; object-fit: cover;
  box-shadow: var(--shadow-sm);
}

.self-avatar {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
}

.session-info { flex: 1; min-width: 0; }

.session-top {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px;
}

.session-name { font-size: 16px; font-weight: 500; color: var(--text-primary); }

.session-time {
  font-size: 12px; color: var(--text-tertiary);
  flex-shrink: 0; margin-left: 8px;
}

.session-bottom { display: flex; justify-content: space-between; align-items: center; }

.session-msg {
  font-size: 13px; color: var(--text-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
}

:deep(.van-badge) { flex-shrink: 0; margin-left: 8px; }

.swipe-delete {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; width: 72px; height: 100%;
  background: #ef4444; color: #fff; font-size: 12px; cursor: pointer;
  svg { width: 20px; height: 20px; }
}

.fab {
  position: fixed; bottom: 84px; right: 20px;
  width: 52px; height: 52px;
  background: var(--fab-bg);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--fab-shadow);
  cursor: pointer; z-index: 100;
  transition: all var(--transition-normal);
  svg { width: 26px; height: 26px; }
  &:active { transform: scale(0.95); }
}

:deep(.van-empty) { padding: 60px 0; }
:deep(.van-empty__description) { color: var(--text-tertiary); }
</style>
