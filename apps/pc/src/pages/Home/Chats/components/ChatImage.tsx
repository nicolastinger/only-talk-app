import {
  getFriendImageMessages,
  getGroupImageMessages,
  openImagePreviewWindow,
} from '@workspace/services';
import AppImage from '@/components/AppImage';
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

  return (
    <AppImage
      src={src}
      loading={loading}
      alt={alt}
      className={className}
      style={style}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      borderRadius={borderRadius}
      onClick={handleClick}
    />
  );
};

export default React.memo(ChatImage);
