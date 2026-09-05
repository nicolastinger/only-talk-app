<script setup lang="ts">
import { ref } from "vue";
import { openPath } from "@tauri-apps/plugin-opener";
import { showToast, showLoadingToast, closeToast } from "vant";
import { formatFileSize, getFileTypeColor } from "@/chat/format";
import { loadChatFile, toLocalPath } from "@/chat/media";
import { isLocalFilePath } from "@/chat/messageParse";

const props = defineProps<{
  fileName: string;
  fileSize?: number;
  fileType?: string;
  /** 服务器记录 biz_id（非本地临时消息时必有） */
  bizId?: string;
  nanoId?: string;
  /** 发送中的本地绝对路径 */
  localPath?: string;
}>();

const busy = ref(false);

const handleOpen = async () => {
  if (busy.value) return;
  busy.value = true;
  showLoadingToast({ message: "打开中...", forbidClick: true, duration: 0 });
  try {
    let path: string | null = null;
    if (props.localPath || isLocalFilePath(props.fileName)) {
      path = props.localPath || props.fileName;
    } else if (props.bizId) {
      const file = await loadChatFile(props.bizId, props.nanoId);
      path = file?.tauri_file_path ? toLocalPath(file.tauri_file_path) : null;
    }
    if (!path) {
      showToast("无法获取文件路径");
      return;
    }
    try {
      await openPath(path);
    } catch (e) {
      console.error("打开文件失败:", path, e);
      showToast({ message: "打开文件失败", icon: "fail" });
    }
  } finally {
    closeToast();
    busy.value = false;
  }
};
</script>

<template>
  <div class="file-msg" @click="handleOpen">
    <div class="file-icon" :style="{ color: getFileTypeColor(fileType) }">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"
        />
      </svg>
    </div>
    <div class="file-info">
      <div class="file-name">{{ fileName }}</div>
      <div class="file-meta">
        <span class="file-ext">.{{ fileType || "file" }}</span>
        <span class="file-size">{{ formatFileSize(fileSize || 0) }}</span>
      </div>
    </div>
    <div class="file-action" aria-label="打开文件">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="less">
.file-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 210px;
  max-width: 260px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;

  &:active {
    opacity: 0.8;
  }
}
.file-icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--surface-alt);
  svg {
    width: 24px;
    height: 24px;
  }
}
.file-info {
  flex: 1;
  min-width: 0;
}
.file-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: break-all;
}
.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-tertiary);
  span {
    display: inline-block;
  }
}
.file-ext {
  color: var(--text-secondary);
}
.file-action {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface);
  color: var(--brand-blue);
  border: 1px solid var(--border-medium);
  svg {
    width: 16px;
    height: 16px;
  }
}
</style>
