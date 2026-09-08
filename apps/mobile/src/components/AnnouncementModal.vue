<script setup lang="ts">
import { ref, watch } from "vue";
import { Popup, Loading } from "vant";
import { get_announcement_read_users, mark_announcement_read } from "@workspace/services";
import type { AnnouncementReadUserVO, AnnouncementVO } from "@workspace/types";
import { useAvatar } from "@/hooks/useAvatar";
import { useAnnouncementStore } from "@/stores/announcement";
import MarkdownRenderer from "@/components/MarkdownRenderer.vue";

interface ReadUserWithAvatar extends AnnouncementReadUserVO {
  avatarUrl?: string | null;
}

const shortId = (uuid: string) =>
  uuid.length > 8 ? `${uuid.slice(0, 8)}…` : uuid;

const props = defineProps<{
  show: boolean;
  announcement: AnnouncementVO | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
}>();

const { ignore } = useAnnouncementStore();
const { getAvatarUrl } = useAvatar();
const readUsers = ref<ReadUserWithAvatar[]>([]);
const loading = ref(false);

const loadReadUsers = async (uuid: string) => {
  loading.value = true;
  try {
    const res = await get_announcement_read_users(uuid, 1, 50);
    const list = res.list || [];
    const enriched = await Promise.all(
      list.map(async (u) => {
        let avatarUrl: string | null = null;
        if (u.icon) {
          try {
            avatarUrl = await getAvatarUrl(u.icon);
          } catch {
            avatarUrl = null;
          }
        }
        return { ...u, avatarUrl };
      })
    );
    readUsers.value = enriched;
  } catch (e) {
    console.error("获取已读用户失败:", e);
    readUsers.value = [];
  } finally {
    loading.value = false;
  }
};

watch(
  [() => props.show, () => props.announcement],
  () => {
    if (props.show && props.announcement) {
      readUsers.value = [];
      // 打开即标记已读(幂等)
      mark_announcement_read(props.announcement.uuid).catch(() => {});
      loadReadUsers(props.announcement.uuid);
    }
  }
);

const close = () => emit("update:show", false);

const handleIgnore = () => {
  if (!props.announcement) return;
  ignore(props.announcement.uuid);
  close();
};
</script>

<template>
  <Popup
    :show="show"
    :round="true"
    :closeable="true"
    position="bottom"
    teleport="body"
    :style="{ maxHeight: '85vh' }"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="announcement" class="ann-modal">
      <div class="modal-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            />
          </svg>
        </div>
        <div class="header-meta">
          <div class="header-title">{{ announcement.title }}</div>
          <div class="header-sub">
            <span>已读</span>
            <span class="header-count">{{ announcement.read_count }}</span>
          </div>
        </div>
      </div>

      <div class="modal-body">
        <div class="content-card">
          <MarkdownRenderer
            :content="announcement.content"
            :allow-html="announcement.content_type === 1"
          />
        </div>

        <div class="read-section">
          <div class="read-header">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
            <span>已读</span>
            <span class="read-count">{{ announcement.read_count }}</span>
          </div>

          <Loading v-if="loading" class="load-spin" size="18" />
          <div v-else-if="readUsers.length === 0" class="read-empty">
            暂无已读用户
          </div>
          <div v-else class="user-list">
            <div v-for="u in readUsers" :key="u.uuid" class="user-chip">
              <img
                class="chip-avatar"
                :src="u.avatarUrl || ''"
                alt="avatar"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
              <span class="chip-name">{{ u.username || shortId(u.uuid) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="ignore-btn" @click="handleIgnore">忽略此公告</button>
        <button class="confirm-btn" @click="close">我知道了</button>
      </div>
    </div>
  </Popup>
</template>

<style scoped lang="less">
.ann-modal {
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  background: var(--surface);
}
.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 8px;
  flex-shrink: 0;
  .header-icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--brand-blue-bg);
    color: var(--brand-blue);
    svg {
      width: 22px;
      height: 22px;
    }
  }
  .header-meta {
    flex: 1;
    min-width: 0;
    .header-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .header-sub {
      margin-top: 2px;
      font-size: 12px;
      color: var(--text-tertiary);
      .header-count {
        margin-left: 4px;
        color: var(--brand-blue);
        font-weight: 600;
      }
    }
  }
}
.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 16px 16px;
  -webkit-overflow-scrolling: touch;
}
.content-card {
  background: var(--surface-alt);
  border-radius: var(--radius-md);
  padding: 14px;
}
.read-section {
  margin-top: 16px;
  .read-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    padding-bottom: 10px;
    svg {
      width: 16px;
      height: 16px;
      color: var(--text-tertiary);
    }
    .read-count {
      color: var(--brand-blue);
    }
  }
  .load-spin {
    display: block;
    margin: 12px auto;
  }
  .read-empty {
    font-size: 13px;
    color: var(--text-tertiary);
    padding: 12px 0;
    text-align: center;
  }
  .user-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 110px;
    overflow-y: auto;
  }
  .user-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 4px;
    background: var(--surface-alt);
    border-radius: var(--radius-full);
    .chip-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--surface-hover);
    }
    .chip-name {
      font-size: 12px;
      color: var(--text-secondary);
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}
.modal-footer {
  display: flex;
  gap: 12px;
  padding: 10px 16px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
  button {
    flex: 1;
    height: 42px;
    border-radius: var(--radius-full);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
  }
  .ignore-btn {
    background: transparent;
    border: 1px solid var(--border-medium);
    color: var(--text-secondary);
    &:active {
      background: var(--surface-hover);
    }
  }
  .confirm-btn {
    background: var(--gradient-primary);
    border: none;
    color: #fff;
    box-shadow: var(--shadow-sm);
    &:active {
      opacity: 0.9;
    }
  }
}
</style>
