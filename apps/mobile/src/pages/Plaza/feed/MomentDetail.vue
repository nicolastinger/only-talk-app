<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showToast, showConfirmDialog, Loading } from "vant";
import {
  getFiles,
  get_moment_detail,
  delete_moment,
  switch_moment_like,
  switch_user_follow,
  post_moment_comment,
  get_moment_comments,
  get_moment_likers,
} from "@workspace/services";
import type {
  MomentVo,
  MomentCommentVo,
  MomentLikerVo,
} from "@workspace/types";
import { getMyUuid } from "@/utils/api";
import { formatMomentTime } from "@/utils/time";
import MomentMedia from "./MomentMedia.vue";
import MomentAvatar from "./MomentAvatar.vue";

const route = useRoute();
const router = useRouter();
const momentId = route.params.id as string;

const moment = ref<MomentVo | null>(null);
const loading = ref(true);
const images = ref<string[]>([]);
const myUuid = ref("");
const busy = ref(false);

const commentList = ref<MomentCommentVo[]>([]);
const commentPage = ref(1);
const commentTotal = ref(0);
const commentFinished = ref(false);
const commentLoading = ref(false);
const commentText = ref("");
const sending = ref(false);

const likerList = ref<MomentLikerVo[]>([]);
const likerPage = ref(1);
const likerTotal = ref(0);
const likerFinished = ref(false);
const likerLoading = ref(false);
const showLikers = ref(false);

const isSelf = computed(
  () => !!moment.value && moment.value.author_uuid === myUuid.value
);

const fmtTime = (ts?: number): string => {
  if (!ts) return "";
  const v = ts > 1e12 ? ts : ts * 1000;
  const date = new Date(v);
  const now = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  if (date.getFullYear() === now.getFullYear())
    return `${mm}-${dd} ${hh}:${min}`;
  return `${date.getFullYear()}-${mm}-${dd} ${hh}:${min}`;
};

const loadImages = async () => {
  const m = moment.value;
  if (!m || !m.image_count) {
    images.value = [];
    return;
  }
  try {
    const files = (await getFiles(m.uuid)) || [];
    images.value = files
      .map((f) => f.tauri_file_path || "")
      .filter(Boolean) as string[];
  } catch {
    images.value = [];
  }
};

const loadComments = async (reset: boolean) => {
  if (!moment.value) return;
  if (!reset && (commentLoading.value || commentFinished.value)) return;
  commentLoading.value = true;
  try {
    const targetPage = reset ? 1 : commentPage.value;
    const result = await get_moment_comments(moment.value.uuid, targetPage, 10);
    commentTotal.value = result.total;
    if (reset) {
      commentList.value = result.list;
      commentPage.value = 2;
    } else {
      commentList.value = commentList.value.concat(result.list);
      commentPage.value += 1;
    }
    if (commentList.value.length >= commentTotal.value)
      commentFinished.value = true;
  } catch (e) {
    console.error("加载评论失败", e);
  } finally {
    commentLoading.value = false;
  }
};

const openLikers = async () => {
  showLikers.value = true;
  if (likerFinished.value || likerList.value.length) return;
  await loadMoreLikers();
};

const loadMoreLikers = async () => {
  if (likerLoading.value || likerFinished.value || !moment.value) return;
  likerLoading.value = true;
  try {
    const result = await get_moment_likers(
      moment.value.uuid,
      likerPage.value,
      20
    );
    likerTotal.value = result.total;
    likerList.value = likerList.value.concat(result.list);
    likerPage.value += 1;
    if (likerList.value.length >= likerTotal.value) likerFinished.value = true;
  } catch (e) {
    console.error("加载点赞失败", e);
  } finally {
    likerLoading.value = false;
  }
};

const sendComment = async () => {
  const content = commentText.value.trim();
  if (!content || !moment.value || sending.value) return;
  sending.value = true;
  try {
    const created = await post_moment_comment({
      moment_uuid: moment.value.uuid,
      content,
    });
    commentList.value.unshift(created);
    moment.value.comment_count = (moment.value.comment_count || 0) + 1;
    commentText.value = "";
    commentTotal.value += 1;
  } catch (e) {
    showToast("评论失败，请重试");
  } finally {
    sending.value = false;
  }
};

const onToggleLike = async () => {
  const m = moment.value;
  if (!m || busy.value) return;
  busy.value = true;
  const liked = m.liked_by_me;
  const prev = m.like_count || 0;
  m.liked_by_me = !liked;
  m.like_count = Math.max(0, prev + (liked ? -1 : 1));
  try {
    await switch_moment_like({ moment_uuid: m.uuid });
  } catch {
    m.liked_by_me = liked;
    m.like_count = prev;
    showToast("操作失败，请重试");
  } finally {
    busy.value = false;
  }
};

const onToggleFollow = async () => {
  const m = moment.value;
  if (!m || busy.value) return;
  busy.value = true;
  const prev = !!m.followed_by_me;
  m.followed_by_me = !prev;
  try {
    await switch_user_follow({ target_user_uuid: m.author_uuid });
    showToast(m.followed_by_me ? "已关注" : "已取消关注");
  } catch {
    m.followed_by_me = prev;
    showToast("操作失败，请重试");
  } finally {
    busy.value = false;
  }
};

const onDelete = async () => {
  if (!moment.value) return;
  try {
    await showConfirmDialog({
      title: "删除动态",
      message: "确定删除这条动态吗？",
      confirmButtonText: "删除",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
    await delete_moment({ moment_uuid: moment.value.uuid });
    showToast({ message: "已删除", icon: "success" });
    router.back();
  } catch (e) {
    if (e !== "cancel") showToast("删除失败，请重试");
  }
};

const goBack = () => router.back();

onMounted(async () => {
  try {
    const result = await get_moment_detail(momentId);
    moment.value = result;
    loadImages();
    loadComments(true);
  } catch (e) {
    console.error("加载动态详情失败", e);
    showToast("动态不存在或已删除");
  } finally {
    loading.value = false;
  }
  try {
    myUuid.value = await getMyUuid();
  } catch {
    myUuid.value = "";
  }
});
</script>

<template>
  <div class="detail-page">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">动态详情</h1>
    </div>

    <div v-if="loading" class="loading-box">
      <Loading size="28">加载中...</Loading>
    </div>

    <template v-else-if="moment">
      <div class="detail-body">
        <div class="detail-card">
          <div class="d-author">
            <div class="d-author-left">
              <span class="d-avatar">
                <MomentAvatar :icon="moment.icon" :size="46" />
              </span>
              <span class="d-author-main">
                <span class="d-username">
                  {{ moment.username || "未知用户" }}
                  <em v-if="isSelf" class="mine-badge">我的</em>
                </span>
                <span class="d-time">
                  {{ formatMomentTime(moment.created_at) }}
                </span>
              </span>
            </div>
            <div class="d-head-right">
              <button
                v-if="!isSelf"
                class="follow-btn"
                :class="{ on: moment.followed_by_me }"
                @click="onToggleFollow"
              >
                {{ moment.followed_by_me ? "已关注" : "关注" }}
              </button>
              <button v-else class="del-btn" @click="onDelete">删除</button>
            </div>
          </div>

          <p v-if="moment.content" class="d-content">{{ moment.content }}</p>

          <MomentMedia
            v-if="images.length"
            :images="images"
            :height="340"
            class="d-media"
          />
        </div>

        <div class="d-actions">
          <div
            class="d-act"
            :class="{ liked: moment.liked_by_me }"
            @click="onToggleLike"
          >
            <svg
              viewBox="0 0 24 24"
              :fill="moment.liked_by_me ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
            <span>{{ moment.like_count || 0 }} 赞</span>
          </div>
          <div class="d-act" @click="openLikers">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path
                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
              />
            </svg>
            <span>点赞的人</span>
          </div>
        </div>

        <div class="comments">
          <div class="comments-title">评论 {{ moment.comment_count || 0 }}</div>

          <div
            v-if="commentList.length === 0 && !commentLoading"
            class="comments-empty"
          >
            还没有评论，来说两句吧
          </div>

          <div v-for="c in commentList" :key="c.id" class="comment-item">
            <MomentAvatar :icon="c.icon" :size="36" />
            <div class="comment-main">
              <span class="comment-name">{{ c.username || "未知用户" }}</span>
              <p class="comment-text">{{ c.content }}</p>
              <span class="comment-time">{{ fmtTime(c.created_at) }}</span>
            </div>
          </div>

          <div
            v-if="!commentFinished && commentList.length > 0"
            class="comments-more"
          >
            <button
              class="more-btn"
              :disabled="commentLoading"
              @click="loadComments(false)"
            >
              {{ commentLoading ? "加载中..." : "加载更多评论" }}
            </button>
          </div>
        </div>
      </div>

      <div class="composer-bar">
        <input
          v-model="commentText"
          class="composer-input"
          type="text"
          placeholder="说点什么..."
          @keyup.enter="sendComment"
        />
        <button
          class="composer-btn"
          :disabled="sending || !commentText.trim()"
          @click="sendComment"
        >
          发送
        </button>
      </div>
    </template>

    <van-popup
      v-model:show="showLikers"
      position="bottom"
      round
      :style="{ height: '60%' }"
      class="likers-popup"
    >
      <div class="likers-head">
        <span class="likers-title">点赞的人</span>
        <button class="likers-close" @click="showLikers = false">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
      <div class="likers-body">
        <div v-for="l in likerList" :key="l.uuid" class="liker-item">
          <MomentAvatar :icon="l.icon" :size="40" />
          <span class="liker-name">{{ l.username || "未知用户" }}</span>
          <span class="liker-time">{{ fmtTime(l.created_at) }}</span>
        </div>
        <div v-if="likerList.length === 0" class="comments-empty">
          还没有人点赞
        </div>
        <div
          v-if="!likerFinished && likerList.length > 0"
          class="comments-more"
        >
          <button
            class="more-btn"
            :disabled="likerLoading"
            @click="loadMoreLikers"
          >
            {{ likerLoading ? "加载中..." : "加载更多" }}
          </button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped lang="less">
.detail-page {
  min-height: 100vh;
  background: var(--page-bg);
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: max(12px, env(safe-area-inset-top)) 16px;
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
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;

  svg {
    width: 24px;
    height: 24px;
  }
}

.title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.loading-box {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

.detail-body {
  padding: 14px 16px 90px;
}

.detail-card {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 14px;
}

.d-author {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.d-author-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.d-avatar {
  padding: 2px;
  border-radius: 50%;
  background: var(--gradient-primary);
  flex-shrink: 0;
}

.d-author-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.d-username {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mine-badge {
  font-style: normal;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  color: #fff;
  background: var(--gradient-primary);
}

.d-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.d-head-right {
  flex-shrink: 0;
}

.follow-btn {
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-full);
  font-size: 13px;
  color: #fff;
  background: var(--gradient-primary);
  cursor: pointer;

  &.on {
    color: var(--text-tertiary);
    background: var(--surface-hover);
    border: 1px solid var(--border-light);
  }
}

.del-btn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-error);
  font-size: 13px;
  cursor: pointer;
}

.d-content {
  margin: 14px 0 0;
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.d-media {
  margin-top: 12px;
}

.d-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.d-act {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  box-shadow: var(--shadow-xs);

  &.liked {
    color: #ff5a7a;
    border-color: rgba(255, 90, 122, 0.3);
  }

  svg {
    width: 20px;
    height: 20px;
  }
}

.comments {
  margin-top: 14px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 14px;
}

.comments-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.comments-empty {
  padding: 26px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.comment-item {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.comment-main {
  flex: 1;
  min-width: 0;
}

.comment-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-blue);
}

.comment-text {
  margin: 3px 0 2px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.comment-time {
  font-size: 11px;
  color: var(--text-placeholder);
}

.comments-more {
  margin: 12px 0 4px;
  text-align: center;
}

.more-btn {
  height: 36px;
  padding: 0 26px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.composer-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border-light);
}

.composer-input {
  flex: 1;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.composer-btn {
  height: 40px;
  padding: 0 22px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.likers-popup {
  overflow: hidden;
}

.likers-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 10px;
}

.likers-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.likers-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--surface-hover);
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
  }
}

.likers-body {
  height: calc(100% - 54px);
  overflow-y: auto;
  padding: 0 20px 20px;
}

.liker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.liker-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.liker-time {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
