<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { showDialog, showToast } from "vant";
import { useAvatar } from "@/hooks/useAvatar";
import { DEFAULT_AVATAR } from "@/stores/user";
import {
  block_friend,
  get_black_list,
  search_user_by_account,
  unblock_friend,
} from "@workspace/services";
import type { BlackListVo, RustResponse, UserInfo } from "@workspace/types";

interface BlackItem extends BlackListVo {
  avatarUrl: string;
}

const router = useRouter();
const { getAvatarUrl } = useAvatar();

const list = ref<BlackItem[]>([]);
const loading = ref(false);

const searchKey = ref("");
const searching = ref(false);
const searchResult = ref<UserInfo | null>(null);
const searchAvatar = ref("");
const blockLoading = ref(false);

const parseUser = (res: RustResponse): UserInfo | null => {
  if (!res.netSuccess) {
    throw new Error(res.error || "网络请求失败");
  }
  const data = JSON.parse(res.res.body);
  if (data.code === 200 && data.data) {
    return data.data as UserInfo;
  }
  throw new Error(data.message || "请求失败");
};

const loadList = async () => {
  loading.value = true;
  try {
    const result = await get_black_list();
    const items = await Promise.all(
      (result || []).map(async (item) => {
        const avatarUrl = item.icon ? ((await getAvatarUrl(item.icon)) || "") : "";
        return { ...item, avatarUrl };
      })
    );
    list.value = items;
  } catch (error) {
    console.error("获取黑名单失败:", error);
    showToast({ message: "获取黑名单失败", icon: "fail" });
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadList();
});

const goBack = () => router.back();

const onSearch = async () => {
  const key = searchKey.value.trim();
  if (!key) {
    showToast({ message: "请输入要拉黑的人的账号", icon: "none" });
    return;
  }
  searching.value = true;
  searchResult.value = null;
  searchAvatar.value = "";
  try {
    const res = await search_user_by_account(key);
    const user = parseUser(res);
    if (user?.uuid) {
      searchResult.value = user;
      searchAvatar.value = user.icon ? ((await getAvatarUrl(user.icon)) || "") : "";
    } else {
      showToast({ message: "未找到该用户", icon: "none" });
    }
  } catch (error) {
    console.error("搜索用户失败:", error);
    showToast({ message: "未找到该用户", icon: "none" });
  } finally {
    searching.value = false;
  }
};

const confirmBlock = () => {
  const user = searchResult.value;
  if (!user?.uuid) return;
  showDialog({
    title: "拉黑用户",
    message: `确定要拉黑 ${user.username || user.account || "该用户"} 吗？拉黑后将不再接收其消息。`,
    confirmButtonText: "拉黑",
    confirmButtonColor: "#ef4444",
    cancelButtonText: "取消",
  })
    .then(async () => {
      blockLoading.value = true;
      try {
        await block_friend(user.uuid);
        showToast({ message: "已拉黑", icon: "success" });
        searchKey.value = "";
        searchResult.value = null;
        searchAvatar.value = "";
        loadList();
      } catch (error) {
        console.error("拉黑失败:", error);
        showToast({ message: "拉黑失败", icon: "fail" });
      } finally {
        blockLoading.value = false;
      }
    })
    .catch(() => {});
};

const confirmUnblock = (item: BlackItem) => {
  showDialog({
    title: "移出黑名单",
    message: `确定将 ${item.username || item.account || "该用户"} 移出黑名单吗？`,
    confirmButtonText: "移出",
    cancelButtonText: "取消",
  })
    .then(async () => {
      try {
        await unblock_friend(item.uuid);
        showToast({ message: "已移出", icon: "success" });
        loadList();
      } catch (error) {
        console.error("移出黑名单失败:", error);
        showToast({ message: "移出失败", icon: "fail" });
      }
    })
    .catch(() => {});
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="黑名单" left-arrow @click-left="goBack" />

    <div class="search-box">
      <input
        v-model="searchKey"
        type="text"
        placeholder="输入对方账号，拉黑后无法收到其消息"
        class="search-input"
        @keyup.enter="onSearch"
      />
      <button class="search-btn" :disabled="searching" @click="onSearch">
        {{ searching ? "搜索中" : "搜索" }}
      </button>
    </div>

    <div v-if="searchResult" class="section-card">
      <div class="black-item">
        <img
          class="black-avatar"
          :src="searchAvatar || DEFAULT_AVATAR"
          alt="avatar"
          @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
        />
        <div class="black-info">
          <div class="black-name">{{ searchResult.username || "-" }}</div>
          <div class="black-account">{{ searchResult.account || "-" }}</div>
        </div>
        <button class="btn-danger" :disabled="blockLoading" @click="confirmBlock">
          {{ blockLoading ? "拉黑中" : "拉黑" }}
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="card-header">
        <span class="header-title">已拉黑（{{ list.length }}）</span>
      </div>
      <div v-if="loading" class="list-state">加载中...</div>
      <div v-else-if="list.length === 0" class="list-state empty-state">
        黑名单为空，被拉黑的人将无法再向你发送消息
      </div>
      <div v-else>
        <div v-for="item in list" :key="item.uuid" class="black-item">
          <img
            class="black-avatar"
            :src="item.avatarUrl || DEFAULT_AVATAR"
            alt="avatar"
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
          <div class="black-info">
            <div class="black-name">{{ item.username || "-" }}</div>
            <div class="black-account">{{ item.account || "-" }}</div>
          </div>
          <button class="btn-plain" @click="confirmUnblock(item)">移出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.search-box {
  display: flex;
  gap: 8px;
  margin: 16px 16px 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 42px;
  padding: 0 14px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-fast);

  &:focus {
    border-color: var(--input-border-focus);
  }

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.search-btn {
  height: 42px;
  padding: 0 20px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-inverse);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:disabled {
    opacity: 0.6;
  }
}

.section-card {
  margin: 16px 16px 0;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.card-header {
  padding: 14px 16px 6px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.list-state {
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.empty-state {
  padding: 32px 16px;
  color: var(--text-placeholder);
}

.black-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.black-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--surface-alt);
}

.black-info {
  flex: 1;
  min-width: 0;
}

.black-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.black-account {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.btn-danger {
  flex-shrink: 0;
  height: 32px;
  padding: 0 16px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-sm);
  color: #ef4444;
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }

  &:active {
    background: rgba(239, 68, 68, 0.15);
  }
}

.btn-plain {
  flex-shrink: 0;
  height: 32px;
  padding: 0 16px;
  background: var(--surface-alt);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;

  &:active {
    background: var(--surface-active);
  }
}
</style>
