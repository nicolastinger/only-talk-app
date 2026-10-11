import AppImage from '@/components/AppImage';
import { DownloadOutlined } from '@ant-design/icons';
import type { ChatFileDownloadProgress } from '@workspace/services';
import {
  getChatFileByBizId,
  getFriendImageMessages,
  getGroupImageMessages,
  hasLocalChatFile,
  openImagePreviewWindow,
} from '@workspace/services';
import { Progress, message } from 'antd';
import React from 'react';
import styles from './styles/ChatImage.less';

interface ChatImageProps {
  src: string | null;
  loading: boolean;
  alt?: string;
  maxWidth?: string;
  maxHeight?: string;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
  friendUuid: string;
  currentBizId: string;
  meUuid: string;
  isGroup?: boolean;
  nanoId?: string;
  /** 图片业务 ID（用于点击下载） */
  bizId?: string;
  /** 是否允许自动下载（关闭或非计量网络外时为 false → 展示点击下载） */
  autoDownload?: boolean;
  /** 是否正在上传（发送中展示进度遮罩） */
  sending?: boolean;
  /** 上传进度百分比 0-100 */
  uploadProgress?: number;
}

const ChatImage: React.FC<ChatImageProps> = ({
  src,
  loading,
  alt = '图片消息',
  maxWidth = '300px',
  maxHeight = '300px',
  borderRadius = '5px',
  className,
  style,
  friendUuid,
  currentBizId,
  meUuid,
  isGroup = false,
  nanoId,
  bizId,
  autoDownload = true,
  sending = false,
  uploadProgress = 0,
}) => {
  const [isOpening, setIsOpening] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [localSrc, setLocalSrc] = React.useState<string | null>(null);
  const [checkingLocal, setCheckingLocal] = React.useState(false);
  const [progress, setProgress] = React.useState<{
    downloaded: number;
    total: number;
  }>({ downloaded: 0, total: 0 });

  const resolvedBizId = bizId || currentBizId;
  const resolvedSrc = src || localSrc;
  const percent =
    progress.total > 0
      ? Math.min(100, Math.floor((progress.downloaded / progress.total) * 100))
      : 0;
  const uploadPercent = Math.max(0, Math.min(100, Math.round(uploadProgress)));
  // 禁止自动下载但本地已有文件时直接展示；仅「本地无文件」才展示点击下载
  const needsDownload =
    !resolvedSrc &&
    !loading &&
    !autoDownload &&
    !checkingLocal &&
    !!resolvedBizId;

  // 挂载/切换消息时先查本地是否已下载：已存在则直接加载，避免重复出现下载按钮
  React.useEffect(() => {
    if (resolvedSrc || !resolvedBizId) return;

    let cancelled = false;
    setCheckingLocal(true);
    (async () => {
      try {
        const local = await hasLocalChatFile(resolvedBizId);
        if (cancelled || !local) return;
        // 本地已有记录：get_chat_file_by_biz_id 直接返回本地路径，不会重复下载
        const files = await getChatFileByBizId(resolvedBizId, nanoId);
        if (cancelled) return;
        const tauriFilePath = files?.[0]?.tauri_file_path;
        if (tauriFilePath) setLocalSrc(tauriFilePath);
      } catch (error) {
        console.error('ChatImage 本地文件检查失败:', error);
      } finally {
        if (!cancelled) setCheckingLocal(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedBizId, resolvedSrc, nanoId]);

  const onProgress = (p: ChatFileDownloadProgress) => {
    setProgress({ downloaded: p.downloaded, total: p.total });
  };

  // 点击已加载图片 → 打开预览窗口
  const handlePreview = async () => {
    if (!resolvedSrc || isOpening) return;

    setIsOpening(true);
    try {
      let imageUrls: string[] = [];
      let currentIndex = 0;

      if (isGroup) {
        const result = await getGroupImageMessages(
          friendUuid,
          resolvedBizId,
          nanoId,
        );
        imageUrls = result.imageUrls;
        currentIndex = result.currentIndex;
      } else {
        const result = await getFriendImageMessages(
          meUuid,
          friendUuid,
          resolvedBizId,
        );
        imageUrls = result.imageUrls;
        currentIndex = result.currentIndex;
      }

      if (imageUrls.length > 0) {
        openImagePreviewWindow(imageUrls, currentIndex);
      }
    } catch (error) {
      console.error('Failed to open image preview:', error);
    } finally {
      setIsOpening(false);
    }
  };

  // 点击下载：展示进度条，完成后直接显示图片
  const handleDownload = async () => {
    if (downloading || !resolvedBizId) return;

    setDownloading(true);
    setProgress({ downloaded: 0, total: 0 });
    try {
      const files = await getChatFileByBizId(resolvedBizId, nanoId, onProgress);
      const tauriFilePath = files?.[0]?.tauri_file_path;
      if (tauriFilePath) {
        setLocalSrc(tauriFilePath);
      } else {
        message.error('图片下载失败');
      }
    } catch (error) {
      console.error('图片下载失败:', error);
      message.error('图片下载失败');
    } finally {
      setDownloading(false);
    }
  };

  if (downloading) {
    return (
      <div
        className={`${styles.placeholder} ${className || ''}`}
        style={{ maxWidth, maxHeight, borderRadius, ...style }}
      >
        <Progress percent={percent} size="small" status="active" />
        <span className={styles.downloadText}>下载中… {percent}%</span>
      </div>
    );
  }

  if (needsDownload) {
    return (
      <div
        className={`${styles.placeholder} ${styles.tappable} ${
          className || ''
        }`}
        style={{ maxWidth, maxHeight, borderRadius, ...style }}
        onClick={handleDownload}
      >
        <DownloadOutlined className={styles.downloadIcon} />
        <span className={styles.downloadText}>点击下载图片</span>
      </div>
    );
  }

  // loading / 无 bizId 时沿用 AppImage 的加载与错误态
  return (
    <div className={styles.imageWrap}>
      <AppImage
        src={resolvedSrc}
        loading={loading || autoDownload || checkingLocal}
        alt={alt}
        className={className}
        style={style}
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        borderRadius={borderRadius}
        onClick={sending ? undefined : handlePreview}
      />
      {sending && (
        <div className={styles.uploadOverlay} style={{ borderRadius }}>
          <Progress
            type="circle"
            percent={uploadPercent}
            size={44}
            strokeColor="#ffffff"
            trailColor="rgba(255, 255, 255, 0.3)"
            format={(p) => (
              <span style={{ color: '#fff', fontSize: 12 }}>{p}%</span>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(ChatImage);
