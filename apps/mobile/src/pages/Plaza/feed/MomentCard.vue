<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast, showConfirmDialog } from "vant";
import {
  getFiles,
  switch_moment_like,
  switch_user_follow,
  delete_moment,
} from "@workspace/services";
import type { MomentVo } from "@workspace/types";
import { ReportTargetType } from "@workspace/types";
import { useAvatar } from "@/hooks/useAvatar";
import { getMyUuid } from "@/utils/api";
import { formatMomentTime } from "@/utils/time";
import { DEFAULT_AVATAR } from "@/stores/user";
import ReportSheet from "@/components/ReportSheet.vue";
import MomentMedia from "./MomentMedia.vue";

const props = defineProps<{ moment: MomentVo }>();
const emit = defineEmits<{ (e: "removed", uuid: string): void }>();

const router = useRouter();
const { getAvatarUrl } = useAvatar();

const avatarUrl = ref("");
const images = ref<string[]>([]);
const myUuid = ref("");

const isSelf = computed(() => props.moment.author_uuid === myUuid.value);
const busy = ref(false);
const showReport = ref(false);

const loadAvatar = async () => {
  if (!props.moment.icon) {
    avatarUrl.value = "";
    return;
  }
  avatarUrl.value = (await getAvatarUrl(props.moment.icon)) || "";
};

const loadImages = async () => {
  if (!props.moment.image_count) {
    images.value = [];
    return;
  }
  try {
    const files = (await getFiles(props.moment.uuid)) || [];
    images.value = files
      .map((f) => f.tauri_file_path || "")
      .filter(Boolean) as string[];
  } catch {
    images.value = [];
  }
};

watch(
  () => props.moment.uuid,
  () => {
    loadAvatar();
    loadImages();
  }
);
onMounted(async () => {
  loadAvatar();
  loadImages();
  try {
    myUuid.value = await getMyUuid();
  } catch {
    myUuid.value = "";
  }
});

const avatar = computed(() => avatarUrl.value || DEFAULT_AVATAR);

const openDetail = () => {
  router.push(`/plaza/moment/${props.moment.uuid}`);
};

const onToggleLike = async () => {
  if (busy.value) return;
  busy.value = true;
  const liked = props.moment.liked_by_me;
  const prev = props.moment.like_count || 0;
  props.moment.liked_by_me = !liked;
  props.moment.like_count = Math.max(0, prev + (liked ? -1 : 1));
  try {
    await switch_moment_like({ moment_uuid: props.moment.uuid });
  } catch {
    props.moment.liked_by_me = liked;
    props.moment.like_count = prev;
    showToast("操作失败，请重试");
  } finally {
    busy.value = false;
  }
};

const onToggleFollow = async () => {
  if (busy.value) return;
  busy.value = true;
  const prev = !!props.moment.followed_by_me;
  props.moment.followed_by_me = !prev;
  try {
    await switch_user_follow({ target_user_uuid: props.moment.author_uuid });
    showToast(props.moment.followed_by_me ? "已关注" : "已取消关注");
  } catch {
    props.moment.followed_by_me = prev;
    showToast("操作失败，请重试");
  } finally {
    busy.value = false;
  }
};

const onDelete = async () => {
  try {
    await showConfirmDialog({
      title: "删除动态",
      message: "确定删除这条动态吗？",
      confirmButtonText: "删除",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
    await delete_moment({ moment_uuid: props.moment.uuid });
    showToast({ message: "已删除", icon: "success" });
    emit("removed", props.moment.uuid);
  } catch (e) {
    if (e !== "cancel") showToast("删除失败，请重试");
  }
};
</script>

<template>
  <div class="m-card">
    <div class="m-head">
      <div class="m-author" @click.stop="openDetail">
        <span class="m-avatar">
          <img
            :src="avatar"
            alt="avatar"
            class="m-avatar-img"
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
        </span>
        <span class="m-author-main">
          <span class="m-username">
            {{ moment.username || "未知用户" }}
            <em v-if="isSelf" class="mine-badge">我的</em>
          </span>
          <span class="m-time">{{ formatMomentTime(moment.created_at) }}</span>
        </span>
      </div>

      <div class="m-head-right">
        <button
          v-if="!isSelf"
          class="follow-btn"
          :class="{ on: moment.followed_by_me }"
          @click.stop="onToggleFollow"
        >
          {{ moment.followed_by_me ? "已关注" : "关注" }}
        </button>
        <button
          v-if="!isSelf"
          class="report-btn"
          title="举报"
          @click.stop="showReport = true"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
          </svg>
        </button>
        <button v-else class="del-btn" @click.stop="onDelete">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
        </button>
      </div>
    </div>

    <p v-if="moment.content" class="m-content">{{ moment.content }}</p>

    <MomentMedia v-if="images.length" :images="images" class="m-media" />

    <div class="m-actions">
      <div
        class="m-act"
        :class="{ liked: moment.liked_by_me }"
        @click.stop="onToggleLike"
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
        <span>{{ moment.like_count || 0 }}</span>
      </div>
      <div class="m-act" @click.stop="openDetail">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <path
            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
          />
        </svg>
        <span>{{ moment.comment_count || 0 }}</span>
      </div>
    </div>

    <ReportSheet
      v-model="showReport"
      :target-type="ReportTargetType.MOMENT"
      :target-uuid="moment.uuid"
      :target-name="moment.username || ''"
    />
  </div>
</template>

<style scoped lang="less">
.m-card {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 14px;
  cursor: pointer;
  transition: transform var(--transition-fast);

  &:active {
    transform: scale(0.99);
  }
}

.m-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.m-author {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.m-avatar {
  flex-shrink: 0;
  padding: 2px;
  border-radius: 50%;
  background: var(--gradient-primary);
}

.m-avatar-img {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.m-author-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.m-username {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
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

.m-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.m-head-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-placeholder);
  cursor: pointer;

  svg {
    width: 18px;
    height: 18px;
  }
}

.follow-btn {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-full);
  font-size: 12px;
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
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-placeholder);
  cursor: pointer;

  svg {
    width: 19px;
    height: 19px;
  }
}

.m-content {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-all;
  white-space: pre-wrap;
}

.m-media {
  margin-top: 10px;
}

.m-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 28px;
  border-top: 1px solid var(--border-light);
  padding-top: 10px;
}

.m-act {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 13px;
  cursor: pointer;

  &.liked {
    color: #ff5a7a;
  }

  svg {
    width: 20px;
    height: 20px;
  }
}
</style>
