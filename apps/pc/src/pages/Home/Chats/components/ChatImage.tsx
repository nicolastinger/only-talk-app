import { getFriendImageMessages, openImagePreviewWindow } from '@workspace/services';
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
}) => {
  const [isOpening, setIsOpening] = React.useState(false);

  const handleClick = async () => {
    if (!src || isOpening) return;

    setIsOpening(true);
    try {
      const { imageUrls, currentIndex } = await getFriendImageMessages(
        meUuid,
        friendUuid,
        currentBizId
      );

      if (imageUrls.length > 0) {
        openImagePreviewWindow(imageUrls, currentIndex);
      }
    } catch (error) {
      console.error('Failed to open image preview:', error);
    } finally {
      setIsOpening(false);
    }
  };

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={{
          maxWidth,
          maxHeight,
          borderRadius,
          display: 'none',
          cursor: 'pointer',
          ...style,
        }}
        onClick={handleClick}
        onLoad={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'block';
        }}
        onError={(e) => {
          console.error('图片加载失败', e);
        }}
      />
    );
  }

  if (loading) {
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
