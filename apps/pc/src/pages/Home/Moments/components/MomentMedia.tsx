import { useEffect, useState } from 'react';
import AppImage from '@/components/AppImage';
import styles from './styles/MomentMedia.less';

const MomentMedia = (props: { images: string[]; onMediaLoad?: () => void }) => {
  const { images, onMediaLoad } = props;
  const [imgIndex, setImgIndex] = useState(0);
  const [tallestRatio, setTallestRatio] = useState<number | null>(null);

  // 预加载所有图并取最高图(高度/宽度)比例, 用于统一容器高度
  useEffect(() => {
    setTallestRatio(null);
    if (images.length === 0) return;
    let mounted = true;
    let max = 0;
    images.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w > 0 && h > 0 && h / w > max) {
          max = h / w;
          if (mounted) setTallestRatio(max);
        }
        if (mounted) onMediaLoad?.();
      };
      img.onerror = () => {
        if (mounted) onMediaLoad?.();
      };
      img.src = src;
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  // images 变化时重置索引回首图
  useEffect(() => {
    setImgIndex(0);
  }, [images]);

  if (images.length === 0) return null;

  return (
    <div
      className={styles.media}
      style={
        tallestRatio ? { aspectRatio: String(1 / tallestRatio) } : undefined
      }
    >
      <img src={images[imgIndex]} className={styles.mediaBg} alt="" aria-hidden />
      <AppImage
        key={imgIndex}
        src={images[imgIndex]}
        fill
        className={styles.mediaImg}
        onLoad={onMediaLoad}
        onError={onMediaLoad}
      />
      {images.length > 1 && (
        <>
          <button
            className={`${styles.arrow} ${styles.arrowLeft}`}
            disabled={imgIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              setImgIndex((i) => Math.max(0, i - 1));
            }}
          >
            ‹
          </button>
          <button
            className={`${styles.arrow} ${styles.arrowRight}`}
            disabled={imgIndex === images.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              setImgIndex((i) => Math.min(images.length - 1, i + 1));
            }}
          >
            ›
          </button>
          <span className={styles.counter}>
            {imgIndex + 1}/{images.length}
          </span>
        </>
      )}
    </div>
  );
};

export default MomentMedia;
