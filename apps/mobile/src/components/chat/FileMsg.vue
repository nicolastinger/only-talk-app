<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { showToast } from "vant";
import { formatFileSize, getFileTypeColor } from "@/chat/format";
import { checkLocalChatFile, loadChatFile, toLocalPath } from "@/chat/media";
import { isLocalFilePath } from "@/chat/messageParse";
import { openLocalFile } from "@workspace/services";

const props = defineProps<{
  fileName: string;
  fileSize?: number;
  fileType?: string;
  /** 服务器记录 biz_id（非本地临时消息时必有） */
  bizId?: string;
  nanoId?: string;
  /** 发送中的本地绝对路径 */
  localPath?: string;
  /** 是否上传中(展示上传动画) */
  sending?: boolean;
}>();

const busy = ref(false);
const downloaded = ref(false);
const checking = ref(false);
const downloading = ref(false);

const resolveLocalPath = (): string | null => {
  if (props.localPath || isLocalFilePath(props.fileName)) {
    return props.localPath || props.fileName;
  }
  return null;
};

const openFile = async (path: string) => {
  try {
    await openLocalFile(path);
  } catch (e) {
    console.error("打开文件失败:", path, e);
    showToast({ message: "打开文件失败", icon: "fail" });
  }
};

const refreshDownloaded = async () => {
  if (resolveLocalPath()) {
    // 本地临时消息（发送中）视为已存在
    downloaded.value = true;
    checking.value = false;
    return;
  }
  if (!props.bizId) {
    downloaded.value = false;
    checking.value = false;
    return;
  }
  checking.value = true;
  downloaded.value = await checkLocalChatFile(props.bizId);
  checking.value = false;
};

const handleClick = async () => {
  if (busy.value || props.sending) return;
  busy.value = true;

  try {
    // 本地已有文件 → 直接打开
    const localPath = resolveLocalPath();
    if (localPath) {
      await openFile(localPath);
      return;
    }

    if (!props.bizId) {
      showToast("无法获取文件路径");
      return;
    }

    // 未下载 → 先下载到本地（内联下载中提示，不阻塞点击）
    if (!downloaded.value) {
      downloading.value = true;
    }
    // 下载(loadChatFile 内部会下载并落库)或取本地路径
    const file = await loadChatFile(props.bizId, props.nanoId);
    if (!file?.tauri_file_path) {
      showToast({ message: downloaded.value ? "打开文件失败" : "下载失败", icon: "fail" });
      return;
    }
    downloaded.value = true;

    // 下载完成后直接打开（无需二次点击）
    await openFile(toLocalPath(file.tauri_file_path));
  } catch (e) {
    console.error("文件下载/打开失败:", e);
    showToast({ message: "操作失败", icon: "fail" });
  } finally {
    downloading.value = false;
    busy.value = false;
  }
};

onMounted(refreshDownloaded);
watch(() => props.bizId, refreshDownloaded);
</script>

<template>
  <div class="file-msg" @click="handleClick">
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
        <span v-if="sending" class="file-size sending-text">上传中…</span>
        <span v-else-if="downloading" class="file-size sending-text">下载中…</span>
        <span v-else-if="checking" class="file-size sending-text">检测中…</span>
        <span v-else-if="downloaded" class="file-size saved-text">已下载</span>
        <span v-else class="file-size">{{
          formatFileSize(fileSize || 0)
        }}</span>
      </div>
    </div>
    <div class="file-action" :class="{ sending }" :aria-label="downloaded ? '打开文件' : '下载文件'">
      <span v-if="sending || downloading" class="spinner"></span>
      <svg v-else-if="downloaded" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 3v4a1 1 0 0 0 1 1h4v13H5V3h9zm1-2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-6-6h-1zM12 8h2v3h3v2h-5V8zm0 5H7v-1h5v1z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
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
.sending-text {
  color: var(--brand-blue);
}
.saved-text {
  color: var(--success-color, #07c160);
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
  &.sending {
    border-color: var(--brand-blue);
  }
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--brand-blue);
  border-radius: 50%;
  animation: file-spin 0.8s linear infinite;
}
@keyframes file-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
