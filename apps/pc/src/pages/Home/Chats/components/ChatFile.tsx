import {
  DownloadOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { useIntl } from '@umijs/max';
import type { ChatFileDownloadProgress } from '@workspace/services';
import { getChatFileByBizId } from '@workspace/services';
import { Dropdown, message, Progress } from 'antd';
import React, { useState } from 'react';
import styles from './styles/ChatFile.less';

interface ChatFileProps {
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
}

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

const ChatFile: React.FC<ChatFileProps> = ({
  bizId,
  fileName,
  fileSize,
  fileType,
  nanoId,
  loading = false,
  sending = false,
  uploadProgress = 0,
  sendPhase,
}) => {
  const intl = useIntl();
  const uploadPercent = Math.max(0, Math.min(100, Math.round(uploadProgress)));
  const uploadIndeterminate = sending && sendPhase !== 'uploading';
  const uploadStatusText = uploadIndeterminate
    ? intl.formatMessage({
        id: sendPhase === 'compressing' ? 'chat.compressing' : 'chat.reading',
      })
    : intl.formatMessage(
        { id: 'chat.uploadingPercent' },
        { percent: uploadPercent },
      );
  const [downloading, setDownloading] = useState(false);
  // 下载进度(字节): total 优先取后端 Content-Length, 为 0 时用消息元数据 fileSize 兜底
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number;
  }>({ downloaded: 0, total: 0 });
  const total = progress.total || fileSize;
  const percent =
    total > 0
      ? Math.min(100, Math.floor((progress.downloaded / total) * 100))
      : 0;

  const onProgress = (p: ChatFileDownloadProgress) => {
    setProgress({ downloaded: p.downloaded, total: p.total });
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
    if (downloading || sending) return;

    setDownloading(true);
    setProgress({ downloaded: 0, total: 0 });
    try {
      const files = await getChatFileByBizId(bizId, nanoId, onProgress);
      if (files && files.length > 0) {
        const tauriFilePath = files[0].tauri_file_path;
        if (tauriFilePath) {
          const localPath = getLocalPath(tauriFilePath);
          console.log('Opening file path:', localPath);
          await openPath(localPath);
        } else {
          message.error('无法获取文件路径');
        }
      } else {
        message.error('文件不存在');
      }
    } catch (error) {
      console.error('打开文件失败:', error);
      message.error('打开文件失败');
    } finally {
      setDownloading(false);
    }
  };

  // 在文件资源管理器中显示
  const handleShowInFolder = async () => {
    if (downloading || sending) return;

    setDownloading(true);
    setProgress({ downloaded: 0, total: 0 });
    try {
      const files = await getChatFileByBizId(bizId, nanoId, onProgress);
      if (files && files.length > 0) {
        const tauriFilePath = files[0].tauri_file_path;
        if (tauriFilePath) {
          const localPath = getLocalPath(tauriFilePath);
          console.log('Revealing file in folder:', localPath);
          await revealItemInDir(localPath);
        } else {
          message.error('无法获取文件路径');
        }
      } else {
        message.error('文件不存在');
      }
    } catch (error) {
      console.error('打开文件夹失败:', error);
      message.error('打开文件夹失败');
    } finally {
      setDownloading(false);
    }
  };

  // 下拉菜单选项
  const menuItems = {
    items: [
      {
        key: 'open',
        label: '打开文件',
        icon: <DownloadOutlined />,
        onClick: handleOpenFile,
      },
      {
        key: 'showInFolder',
        label: '打开所在文件夹',
        icon: <FolderOpenOutlined />,
        onClick: handleShowInFolder,
      },
    ],
  };

  return (
    <div className={styles.container}>
      <div
        className={styles.fileIcon}
        style={{ color: getFileTypeColor(fileType) }}
      >
        <PaperClipOutlined />
      </div>
      <div className={styles.fileInfo}>
        <div className={styles.fileName} title={fileName}>
          {fileName}
        </div>
        <div className={styles.fileMeta}>
          <span className={styles.fileType}>.{fileType || 'file'}</span>
          {sending ? (
            <span className={styles.fileSize}>{uploadStatusText}</span>
          ) : (
            <span className={styles.fileSize}>{formatFileSize(fileSize)}</span>
          )}
        </div>
        {downloading && (
          <div className={styles.progressBar}>
            <Progress
              percent={percent}
              size="small"
              status="active"
              showInfo={false}
            />
          </div>
        )}
        {sending && uploadIndeterminate && (
          <div className={styles.progressBar}>
            <div className={styles.progressIndeterminate}>
              <div className={styles.progressIndeterminateInner} />
            </div>
          </div>
        )}
        {sending && !uploadIndeterminate && (
          <div className={styles.progressBar}>
            <Progress
              percent={uploadPercent}
              size="small"
              status="active"
              showInfo={false}
            />
          </div>
        )}
      </div>
      <Dropdown menu={menuItems} trigger={['click']}>
        <div
          className={`${styles.downloadBtn} ${
            downloading ? styles.downloading : ''
          }`}
          title={downloading ? `下载中 ${percent}%` : '点击选择操作'}
        >
          {downloading || sending ? (
            <div className={styles.loadingIcon}>
              <LoadingOutlined />
            </div>
          ) : (
            <DownloadOutlined />
          )}
        </div>
      </Dropdown>
    </div>
  );
};

export default React.memo(ChatFile);
