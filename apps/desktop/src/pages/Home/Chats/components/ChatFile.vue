<script setup lang="ts">
import { computed, h, ref } from 'vue';
import {
  DownloadOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  PaperClipOutlined,
} from '@ant-design/icons-vue';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import type { ChatFileDownloadProgress } from '@workspace/services';
import { getChatFileByBizId } from '@workspace/services';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './styles/ChatFile.module.less';

const props = withDefaults(
  defineProps<{
    bizId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    nanoId?: string;
    loading?: boolean;
    /** 是否正在上传（发送中展示上传进度条） */
    sending?: boolean;
    /** 上传进度百分比 0-100 */
    uploadProgress?: number;
    /** 发送阶段：reading/compressing/uploading */
    sendPhase?: string;
  }>(),
  {
    sending: false,
    uploadProgress: 0,
  },
);

const { t } = useI18n();

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 根据文件类型获取图标颜色
const getFileTypeColor = (fileType: string | undefined): string => {
  if (!fileType) return '#8c8c8c';
  const type = fileType.toLowerCase();
  // 文档类型
  if (
    ['doc', 'docx', 'pdf', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(type)
  ) {
    return '#1890ff';
  }
  // 压缩文件
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(type)) {
    return '#fa8c16';
  }
  // 代码文件
  if (
    [
      'js',
      'ts',
      'jsx',
      'tsx',
      'html',
      'css',
      'json',
      'py',
      'java',
      'rs',
      'go',
    ].includes(type)
  ) {
    return '#52c41a';
  }
  // 默认颜色
  return '#8c8c8c';
};

const uploadPercent = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.uploadProgress))),
);
const uploadIndeterminate = computed(
  () => props.sending && props.sendPhase !== 'uploading',
);
const uploadStatusText = computed(() =>
  uploadIndeterminate.value
    ? t(props.sendPhase === 'compressing' ? 'chat.compressing' : 'chat.reading')
    : t('chat.uploadingPercent', { percent: uploadPercent.value }),
);

const downloading = ref(false);
// 下载进度(字节): total 优先取后端 Content-Length, 为 0 时用消息元数据 fileSize 兜底
const progress = ref<{
  downloaded: number;
  total: number;
}>({ downloaded: 0, total: 0 });
const total = computed(() => progress.value.total || props.fileSize);
const percent = computed(() =>
  total.value > 0
    ? Math.min(100, Math.floor((progress.value.downloaded / total.value) * 100))
    : 0,
);

const onProgress = (p: ChatFileDownloadProgress) => {
  progress.value = { downloaded: p.downloaded, total: p.total };
};

// 获取本地文件路径
const getLocalPath = (tauriFilePath: string): string => {
  let localPath = tauriFilePath;
  if (tauriFilePath.startsWith('http://asset.localhost/')) {
    const encodedPath = tauriFilePath.replace('http://asset.localhost/', '');
    localPath = decodeURIComponent(encodedPath);
  }

  // 统一 Windows 路径分隔符
  if (localPath.includes(':\\') && localPath.includes('/')) {
    localPath = localPath.replace(/\//g, '\\');
  }

  return localPath;
};

// 直接打开文件
const handleOpenFile = async () => {
  if (downloading.value || props.sending) return;

  downloading.value = true;
  progress.value = { downloaded: 0, total: 0 };
  try {
    const files = await getChatFileByBizId(props.bizId, props.nanoId, onProgress);
    if (files && files.length > 0) {
      const tauriFilePath = files[0].tauri_file_path;
      if (tauriFilePath) {
        const localPath = getLocalPath(tauriFilePath);
        console.log('Opening file path:', localPath);
        await openPath(localPath);
      } else {
        feedback.message.error('无法获取文件路径');
      }
    } else {
      feedback.message.error('文件不存在');
    }
  } catch (error) {
    console.error('打开文件失败:', error);
    feedback.message.error('打开文件失败');
  } finally {
    downloading.value = false;
  }
};

// 在文件资源管理器中显示
const handleShowInFolder = async () => {
  if (downloading.value || props.sending) return;

  downloading.value = true;
  progress.value = { downloaded: 0, total: 0 };
  try {
    const files = await getChatFileByBizId(props.bizId, props.nanoId, onProgress);
    if (files && files.length > 0) {
      const tauriFilePath = files[0].tauri_file_path;
      if (tauriFilePath) {
        const localPath = getLocalPath(tauriFilePath);
        console.log('Revealing file in folder:', localPath);
        await revealItemInDir(localPath);
      } else {
        feedback.message.error('无法获取文件路径');
      }
    } else {
      feedback.message.error('文件不存在');
    }
  } catch (error) {
    console.error('打开文件夹失败:', error);
    feedback.message.error('打开文件夹失败');
  } finally {
    downloading.value = false;
  }
};

// 下拉菜单选项
const menuItems = computed(() => ({
  items: [
    {
      key: 'open',
      label: '打开文件',
      icon: h(DownloadOutlined),
      onClick: handleOpenFile,
    },
    {
      key: 'showInFolder',
      label: '打开所在文件夹',
      icon: h(FolderOpenOutlined),
      onClick: handleShowInFolder,
    },
  ],
}));
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.fileIcon" :style="{ color: getFileTypeColor(fileType) }">
      <PaperClipOutlined />
    </div>
    <div :class="styles.fileInfo">
      <div :class="styles.fileName" :title="fileName">
        {{ fileName }}
      </div>
      <div :class="styles.fileMeta">
        <span :class="styles.fileType">.{{ fileType || 'file' }}</span>
        <span v-if="sending" :class="styles.fileSize">{{ uploadStatusText }}</span>
        <span v-else :class="styles.fileSize">{{ formatFileSize(fileSize) }}</span>
      </div>
      <div v-if="downloading" :class="styles.progressBar">
        <a-progress
          :percent="percent"
          size="small"
          status="active"
          :show-info="false"
        />
      </div>
      <div v-if="sending && uploadIndeterminate" :class="styles.progressBar">
        <div :class="styles.progressIndeterminate">
          <div :class="styles.progressIndeterminateInner" />
        </div>
      </div>
      <div v-if="sending && !uploadIndeterminate" :class="styles.progressBar">
        <a-progress
          :percent="uploadPercent"
          size="small"
          status="active"
          :show-info="false"
        />
      </div>
    </div>
    <a-dropdown :menu="menuItems" :trigger="['click']">
      <div
        :class="[styles.downloadBtn, downloading ? styles.downloading : '']"
        :title="downloading ? `下载中 ${percent}%` : '点击选择操作'"
      >
        <div v-if="downloading || sending" :class="styles.loadingIcon">
          <LoadingOutlined />
        </div>
        <DownloadOutlined v-else />
      </div>
    </a-dropdown>
  </div>
</template>
