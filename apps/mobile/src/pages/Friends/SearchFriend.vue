<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { showToast, Field, Empty, Overlay } from "vant";
import { search_user_by_account, add_friend } from "@workspace/services";
import { useAvatar } from "@/hooks/useAvatar";
import { parseResponse } from "@/utils/api";
import { DEFAULT_AVATAR } from "@/stores/user";
import type { FriendRequestInfoDTO, UserInfo } from "@workspace/types";

const router = useRouter();
const { getAvatarUrl } = useAvatar();

const searchText = ref("");
const searching = ref(false);
const searchResult = ref<(UserInfo & { avatar?: string }) | null>(null);
const searchedAccount = ref("");
const showRequestModal = ref(false);
const requestMessage = ref("");
const requestLoading = ref(false);
const resultAvatarUrl = ref<string | null>(null);

const onSearch = async () => {
  const account = searchText.value.trim();
  if (!account) {
    showToast("请输入账号");
    return;
  }
  searching.value = true;
  searchResult.value = null;
  searchedAccount.value = account;
  resultAvatarUrl.value = null;
  try {
    const res = await search_user_by_account(account);
    if (res.netSuccess) {
      searchResult.value = parseResponse<UserInfo>(res) || null;
      if (searchResult.value?.icon) {
        resultAvatarUrl.value = await getAvatarUrl(searchResult.value.icon);
      }
    } else {
      showToast("搜索失败，请稍后重试");
    }
  } catch (e) {
    showToast("未找到该用户");
  } finally {
    searching.value = false;
  }
};

const onAddFriend = () => {
  requestMessage.value = "";
  showRequestModal.value = true;
};

const onSendRequest = async () => {
  if (!searchResult.value) return;
  requestLoading.value = true;
  try {
    await add_friend({
      request_message: requestMessage.value.trim() || "请求添加好友",
      accept_message: "",
      accept_user: searchResult.value.uuid,
      add_type: "search",
      version: 0,
      accept_status: 0,
    } as FriendRequestInfoDTO);
    showToast({ message: "好友请求已发送", icon: "success" });
    showRequestModal.value = false;
  } catch (e) {
    showToast("发送失败，请稍后重试");
  } finally {
    requestLoading.value = false;
  }
};

const getAvatar = () => {
  if (resultAvatarUrl.value) return resultAvatarUrl.value;
  return DEFAULT_AVATAR;
};
const goBack = () => router.back();
</script>

<template>
  <div class="search-friend-page">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">添加好友</h1>
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
          placeholder="输入好友账号搜索"
          class="search-input"
          @keyup.enter="onSearch"
        />
      </div>
      <button
        class="search-btn"
        :disabled="searching || !searchText.trim()"
        @click="onSearch"
      >
        {{ searching ? "搜索中..." : "搜索" }}
      </button>
    </div>

    <div class="result-section">
      <div v-if="searchResult" class="result-card">
        <img
          :src="getAvatar()"
          class="result-avatar"
          @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
        />
        <div class="result-info">
          <span class="result-name">{{
            searchResult.username || searchResult.account
          }}</span>
          <span class="result-account">@{{ searchResult.account }}</span>
          <span v-if="searchResult.info" class="result-bio">{{
            searchResult.info
          }}</span>
        </div>
        <button class="add-btn" @click="onAddFriend">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
          <span>添加</span>
        </button>
      </div>
      <Empty
        v-else-if="searchedAccount && !searching"
        description="未找到该用户"
      />
      <div v-else-if="!searching" class="search-hint">
        <svg viewBox="0 0 24 24" fill="currentColor" class="hint-icon">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <p>输入好友的账号进行搜索</p>
      </div>
    </div>

    <Overlay :show="showRequestModal" @click="showRequestModal = false">
      <div class="modal-wrapper" @click.stop>
        <div class="request-modal">
          <h2 class="modal-title">发送好友请求</h2>
          <div class="modal-target" v-if="searchResult">
            <img
              :src="getAvatar()"
              class="target-avatar"
              @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
            />
            <div class="target-info">
              <span class="target-name">{{
                searchResult.username || searchResult.account
              }}</span>
              <span class="target-account">@{{ searchResult.account }}</span>
            </div>
          </div>
          <Field
            v-model="requestMessage"
            type="textarea"
            rows="3"
            placeholder="发送一段验证消息（选填）"
            maxlength="100"
            show-word-limit
            class="message-field"
          />
          <div class="modal-actions">
            <button class="cancel-btn" @click="showRequestModal = false">
              取消
            </button>
            <button
              class="send-btn"
              :disabled="requestLoading"
              @click="onSendRequest"
            >
              {{ requestLoading ? "发送中..." : "发送请求" }}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  </div>
</template>

<style scoped lang="less">
.search-friend-page {
  min-height: 100vh;
  background: var(--page-bg);
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
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
  svg {
    width: 20px;
    height: 20px;
  }
  &:active {
    background: var(--surface-hover);
  }
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.search-section {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
}

.search-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-xs);
  &:focus-within {
    border-color: var(--brand-blue);
    box-shadow: var(--shadow-glow-sm);
  }
}

.search-icon {
  width: 20px;
  height: 20px;
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

.search-btn {
  padding: 10px 20px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  &:disabled {
    opacity: 0.5;
  }
  &:active:not(:disabled) {
    transform: scale(0.97);
  }
}

.result-section {
  padding: 0 20px;
}

.result-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.result-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.result-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.result-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.result-account {
  font-size: 13px;
  color: var(--text-tertiary);
}
.result-bio {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--gradient-primary);
  border: none;
  border-radius: 16px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  svg {
    width: 18px;
    height: 18px;
  }
  &:active {
    transform: scale(0.96);
  }
}

.search-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
}
.hint-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.3;
}
.search-hint p {
  font-size: 14px;
  margin: 0;
}

.modal-wrapper {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
}

.request-modal {
  width: 100%;
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  padding: 24px 20px 32px;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 20px;
  text-align: center;
}
.modal-target {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--surface-alt);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}
.target-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
}
.target-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.target-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.target-account {
  font-size: 13px;
  color: var(--text-tertiary);
}

.message-field {
  :deep(.van-field__control) {
    color: var(--text-primary);
  }
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.cancel-btn,
.send-btn {
  flex: 1;
  height: 46px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);
  &:active {
    transform: scale(0.97);
  }
}
.cancel-btn {
  background: var(--surface-alt);
  color: var(--text-secondary);
  border: 1px solid var(--border-medium);
}
.send-btn {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-sm);
  &:disabled {
    opacity: 0.5;
  }
}

:deep(.van-empty) {
  padding: 60px 0;
}
:deep(.van-empty__description) {
  color: var(--text-tertiary);
}
</style>
