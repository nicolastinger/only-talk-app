<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { Empty, showConfirmDialog, showToast } from "vant";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { FileType, LocalFileVo } from "@workspace/types";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();
const goBack = () => router.back();

const files = ref<LocalFileVo[]>([]);
const loading = ref(false);
const fileType = ref<FileType | "">("");
const sortBy = ref<"name" | "date">("date");
const sortOrder = ref<"desc" | "asc">("desc");

const typeOptions = computed<{ label: string; value: FileType | "" }[]>(() => [
  { label: t("settings.fileManager.all"), value: "" },
  { label: t("settings.fileManager.image"), value: "image" },
  { label: t("settings.fileManager.video"), value: "video" },
  { label: t("settings.fileManager.audio"), value: "audio" },
  { label: t("settings.fileManager.document"), value: "document" },
  { label: t("settings.fileManager.archive"), value: "archive" },
  { label: t("settings.fileManager.other"), value: "other" },
]);

const formatSize = (size: number) => {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)}MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)}GB`;
};

const formatTime = (ms: number) => {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
};

const load = async (
  type = fileType.value,
  by = sortBy.value,
  order = sortOrder.value
) => {
  loading.value = true;
  try {
    files.value =
      (await invoke<LocalFileVo[]>("get_local_file_list", {
        fileType: type || null,
        sortBy: by,
        sortOrder: order,
      })) || [];
  } catch (error) {
    console.error("获取文件列表失败:", error);
    showToast({ message: t("settings.fileManager.loadFailed"), icon: "fail" });
  } finally {
    loading.value = false;
  }
};

const onTypeChange = (v: FileType | "") => {
  fileType.value = v;
  load(v);
};

const onSortByChange = (v: "name" | "date") => {
  sortBy.value = v;
  load(fileType.value, v);
};

const onSortOrderChange = (v: "desc" | "asc") => {
  sortOrder.value = v;
  load(fileType.value, sortBy.value, v);
};

const onDelete = async (file: LocalFileVo) => {
  try {
    await showConfirmDialog({
      title: t("settings.fileManager.deleteTitle"),
      message: t("settings.fileManager.deleteConfirmNamed", {
        name: file.file_name,
      }),
      confirmButtonText: t("common.delete"),
      confirmButtonColor: "#ee0a24",
      cancelButtonText: t("common.cancel"),
    });
  } catch {
    return;
  }
  try {
    await invoke("delete_local_file", { id: file.id });
    showToast({ message: t("settings.fileManager.deleteSuccess"), icon: "success" });
    load();
  } catch (error) {
    console.error("删除文件失败:", error);
    showToast({ message: t("settings.fileManager.deleteFailed"), icon: "fail" });
  }
};

const onOpen = async (file: LocalFileVo) => {
  try {
    await invoke("open_local_file", { path: file.file_path });
  } catch (e) {
    console.error("打开文件失败:", file.file_path, e);
    showToast({ message: t("chat.openFileFailed"), icon: "fail" });
  }
};

const thumb = (file: LocalFileVo) =>
  file.file_type === "image" ? convertFileSrc(file.file_path) : "";

onMounted(() => {
  load();
});
</script>

<template>
  <div class="files-page">
    <van-nav-bar
      :title="t('settings.fileManager.title')"
      left-arrow
      @click-left="goBack"
    />

    <div class="type-filter">
      <button
        v-for="opt in typeOptions"
        :key="opt.value || 'all'"
        class="type-chip"
        :class="{ active: fileType === opt.value }"
        @click="onTypeChange(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="sort-bar">
      <div class="sort-group">
        <button
          class="sort-chip"
          :class="{ active: sortBy === 'date' }"
          @click="onSortByChange('date')"
        >
          {{ t("settings.fileManager.sortByDate") }}
        </button>
        <button
          class="sort-chip"
          :class="{ active: sortBy === 'name' }"
          @click="onSortByChange('name')"
        >
          {{ t("settings.fileManager.sortByName") }}
        </button>
      </div>
      <div class="sort-group">
        <button
          class="sort-chip"
          :class="{ active: sortOrder === 'desc' }"
          @click="onSortOrderChange('desc')"
        >
          {{ t("settings.fileManager.desc") }}
        </button>
        <button
          class="sort-chip"
          :class="{ active: sortOrder === 'asc' }"
          @click="onSortOrderChange('asc')"
        >
          {{ t("settings.fileManager.asc") }}
        </button>
      </div>
    </div>

    <van-loading
      v-if="loading"
      class="list-state"
      color="#1989fa"
      size="24"
      vertical
    >
      {{ t("common.loadingDots") }}
    </van-loading>

    <Empty
      v-else-if="files.length === 0"
      image="search"
      :description="t('settings.fileManager.empty')"
    />

    <div v-else class="file-list">
<div
        v-for="file in files"
        :key="file.id"
        class="file-item"
        @click="onOpen(file)"
      >
        <img
          v-if="file.file_type === 'image'"
          :src="thumb(file)"
          alt=""
          class="file-thumb"
        />
        <div v-else class="file-thumb file-icon">{{ file.ext }}</div>
        <div class="file-body">
          <div class="file-name" :title="file.file_name">
            {{ file.file_name }}
          </div>
          <div class="file-meta">
            <span>{{ formatSize(file.file_size) }}</span>
            <span>{{ formatTime(file.created_at) }}</span>
          </div>
        </div>
        <button class="delete-btn" @click.stop="onDelete(file)">
          {{ t("settings.fileManager.delete") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.files-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.type-filter {
  display: flex;
  gap: 8px;
  padding: 12px 16px 0;
  overflow-x: auto;
  flex-wrap: nowrap;

  &::-webkit-scrollbar {
    display: none;
  }
}

.type-chip {
  flex-shrink: 0;
  height: 28px;
  padding: 0 14px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--surface);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }
}

.sort-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px 0;
}

.sort-group {
  display: flex;
  gap: 8px;
}

.sort-chip {
  height: 28px;
  padding: 0 14px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--surface);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: var(--surface-alt);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.list-state {
  padding: 40px 0;
}

.file-list {
  padding: 4px 16px 0;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
}

.file-thumb {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 8px;
  object-fit: cover;
  background: var(--surface-alt);

  &.file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }
}

.file-body {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.delete-btn {
  flex-shrink: 0;
  height: 30px;
  padding: 0 14px;
  border: 1px solid rgba(238, 10, 36, 0.4);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 12px;
  color: #ee0a24;
  cursor: pointer;

  &:active {
    background: rgba(238, 10, 36, 0.08);
  }
}
</style>