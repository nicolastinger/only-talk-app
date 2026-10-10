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
  isBackendSuccess,
} from "@workspace/services";
import type { BlackListVo, RustResponse, UserInfo } from "@workspace/types";
import { useI18n } from "@/i18n";

interface BlackItem extends BlackListVo {
  avatarUrl: string;
}

const router = useRouter();
const { t } = useI18n();
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
  if (isBackendSuccess(data.code) && data.data) {
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
    showToast({ message: t("settings.blacklist.loadFailed"), icon: "fail" });
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
    showToast({ message: t("settings.blacklist.enterAccount"), icon: "none" });
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
      showToast({ message: t("settings.blacklist.notFound"), icon: "none" });
    }
  } catch (error) {
    console.error("搜索用户失败:", error);
    showToast({ message: t("settings.blacklist.notFound"), icon: "none" });
  } finally {
    searching.value = false;
  }
};

const confirmBlock = () => {
  const user = searchResult.value;
  if (!user?.uuid) return;
  showDialog({
    title: t("settings.blacklist.blockConfirmTitle"),
    message: t("settings.blacklist.blockConfirmMsg", {
      name: user.username || user.account || user.uuid,
    }),
    confirmButtonText: t("settings.blacklist.block"),
    confirmButtonColor: "#ef4444",
    cancelButtonText: t("common.cancel"),
  })
    .then(async () => {
      blockLoading.value = true;
      try {
        await block_friend(user.uuid);
        showToast({
          message: t("settings.blacklist.blockSuccess"),
          icon: "success",
        });
        searchKey.value = "";
        searchResult.value = null;
        searchAvatar.value = "";
        loadList();
      } catch (error) {
        console.error("拉黑失败:", error);
        showToast({
          message: t("settings.blacklist.blockFailed"),
          icon: "fail",
        });
      } finally {
        blockLoading.value = false;
      }
    })
    .catch(() => {});
};

const confirmUnblock = (item: BlackItem) => {
  showDialog({
    title: t("settings.blacklist.unblockConfirmTitle"),
    message: t("settings.blacklist.unblockConfirmMsg", {
      name: item.username || item.account || item.uuid,
    }),
    confirmButtonText: t("settings.blacklist.unblockConfirmBtn"),
    cancelButtonText: t("common.cancel"),
  })
    .then(async () => {
      try {
        await unblock_friend(item.uuid);
        showToast({
          message: t("settings.blacklist.unblockSuccess"),
          icon: "success",
        });
        loadList();
      } catch (error) {
        console.error("移出黑名单失败:", error);
        showToast({
          message: t("settings.blacklist.unblockFailed"),
          icon: "fail",
        });
      }
    })
    .catch(() => {});
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar
      :title="t('settings.blacklist.title')"
      left-arrow
      @click-left="goBack"
    />

    <div class="search-box">
      <input
        v-model="searchKey"
        type="text"
        :placeholder="t('settings.blacklist.searchPlaceholder')"
        class="search-input"
        @keyup.enter="onSearch"
      />
      <button class="search-btn" :disabled="searching" @click="onSearch">
        {{
          searching
            ? t("settings.blacklist.searching")
            : t("settings.blacklist.search")
        }}
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
          <div class="black-name">
            {{ searchResult.username || "-" }}
            <UserTypeTag :type="searchResult.user_type" />
          </div>
          <div class="black-account">{{ searchResult.account || "-" }}</div>
        </div>
        <button class="btn-danger" :disabled="blockLoading" @click="confirmBlock">
          {{
            blockLoading
              ? t("settings.blacklist.blocking")
              : t("settings.blacklist.block")
          }}
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="card-header">
        <span class="header-title">{{
          t("settings.blacklist.blockedCount", { count: list.length })
        }}</span>
      </div>
      <div v-if="loading" class="list-state">
        {{ t("settings.blacklist.loading") }}
      </div>
      <div v-else-if="list.length === 0" class="list-state empty-state">
        {{ t("settings.blacklist.empty") }}
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
            <div class="black-name">
              {{ item.username || "-" }}
              <UserTypeTag :type="item.user_type" />
            </div>
            <div class="black-account">{{ item.account || "-" }}</div>
          </div>
          <button class="btn-plain" @click="confirmUnblock(item)">
            {{ t("settings.blacklist.unblock") }}
          </button>
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
