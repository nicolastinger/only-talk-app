import React, { useEffect, useState } from 'react';
import styles from './index.less';

interface AppImageProps {
  src: string | null;
  alt?: string;
  loading?: boolean;
  maxWidth?: number | string;
  maxHeight?: number | string;
  borderRadius?: number | string;
  objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onLoad?: () => void;
  onError?: () => void;
  errorText?: string;
  loadingText?: string;
  fill?: boolean;
}

const AppImage: React.FC<AppImageProps> = ({
  src,
  alt = '图片',
  loading: externalLoading,
  maxWidth,
  maxHeight,
  borderRadius,
  objectFit = 'contain',
  className,
  style,
  onClick,
  onLoad,
  onError,
  errorText = '图片加载失败',
  loadingText = '加载中...',
  fill = false,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // src 变化时重置状态
  useEffect(() => {
    if (src) {
      setLoaded(false);
      setFailed(false);
    }
  }, [src]);

  const handleLoad = async (e: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      await e.currentTarget.decode();
    } catch {
      setFailed(true);
      onError?.();
      return;
    }
    setLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setFailed(true);
    onError?.();
  };

  // 无 src：由外部 loading 决定显示加载中还是失败提示
  if (!src) {
    return (
      <div
        className={`${styles.state} ${className || ''}`}
        style={{ maxWidth, maxHeight, borderRadius, ...style }}
      >
        <span>{externalLoading ? loadingText : errorText}</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className={`${styles.state} ${className || ''}`}
        style={{ maxWidth, maxHeight, borderRadius, ...style }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14zm-8-4h2v2h-2v-2zm0-6h2v4h-2V9z" />
        </svg>
        <span>{errorText}</span>
      </div>
    );
  }

  const imgStyle: React.CSSProperties = {
    maxWidth,
    maxHeight,
    borderRadius,
    objectFit,
    cursor: onClick ? 'pointer' : undefined,
    ...style,
  };

  // fill 模式：铺满容器并居中，可叠加加载/错误遮罩
  if (fill) {
    return (
      <div className={`${styles.fillWrap} ${className || ''}`}>
        <img
          src={src}
          alt={alt}
          className={styles.imgFill}
          style={imgStyle}
          onLoad={handleLoad}
          onError={handleError}
        />
        {externalLoading && !loaded && (
          <div className={styles.overlay}>
            <span>{loadingText}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${styles.img} ${className || ''}`}
      style={imgStyle}
      onClick={onClick}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
};

export default React.memo(AppImage);
