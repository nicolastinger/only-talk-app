import {
  getFriendImageMessages,
  getGroupImageMessages,
  openImagePreviewWindow,
} from '@workspace/services';
import React from 'react';

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
}) => {
  const [isOpening, setIsOpening] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // 检查图片是否已经缓存加载完成（onLoad可能在handler挂载前触发）
  React.useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      // 图片已缓存，无需特殊处理
    }
  }, [src]);

  const handleClick = async () => {
    if (!src || isOpening) return;

    setIsOpening(true);
    try {
      let imageUrls: string[] = [];
      let currentIndex = 0;

      if (isGroup) {
        // 群聊图片预览：使用群聊记录接口，双层JSON解析
        const result = await getGroupImageMessages(
          friendUuid,
          currentBizId,
          nanoId,
        );
        imageUrls = result.imageUrls;
        currentIndex = result.currentIndex;
      } else {
        // 单聊图片预览
        const result = await getFriendImageMessages(
          meUuid,
          friendUuid,
          currentBizId,
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

  if (src && !imgError) {
    return (
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        style={{
          maxWidth,
          maxHeight,
          borderRadius,
          cursor: 'pointer',
          ...style,
        }}
        onClick={handleClick}
        onError={(e) => {
          console.error('图片加载失败', e);
          setImgError(true);
        }}
      />
    );
  }

  if (loading && !imgError) {
    return (
      <div
        className={className}
        style={{
          maxWidth,
          maxHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: '12px',
          ...style,
        }}
      >
        加载中...
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        maxWidth,
        maxHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        fontSize: '12px',
        ...style,
      }}
    >
      图片加载失败
    </div>
  );
};

export default React.memo(ChatImage);
