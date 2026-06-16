import { ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Image } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './index.less';

interface ImagePreviewProps {
  imagePaths: string[];
  currentIndex?: number;
  onClose?: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  imagePaths,
  currentIndex = 0,
  onClose,
}) => {
  const intl = useIntl();
  const [current, setCurrent] = useState(currentIndex);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setCurrent(currentIndex);
    setScale(1);
  }, [currentIndex]);

  const handlePrev = () => {
    setCurrent((prev) => (prev > 0 ? prev - 1 : imagePaths.length - 1));
    setScale(1);
  };

  const handleNext = () => {
    setCurrent((prev) => (prev < imagePaths.length - 1 ? prev + 1 : 0));
    setScale(1);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.5, 0.5));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    } else if (e.key === 'Escape') {
      onClose?.();
    } else if (e.key === '+' || e.key === '=') {
      handleZoomIn();
    } else if (e.key === '-') {
      handleZoomOut();
    }
  };

  if (imagePaths.length === 0) {
    return null;
  }

  return (
    <div className={styles.container} onKeyDown={handleKeyDown} tabIndex={0}>
      <div
        className={styles.backgroundBlur}
        style={{ backgroundImage: `url(${imagePaths[current]})` }}
      />
      <div className={styles.overlay} />

      <div className={styles.header}>
        <span className={styles.counter}>
          {current + 1} / {imagePaths.length}
        </span>
        <div className={styles.headerActions}>
          <Button
            type="text"
            icon={<ZoomOutOutlined />}
            onClick={handleZoomOut}
            className={styles.iconButton}
            title={intl.formatMessage({ id: 'imagePreview.zoomOut' })}
          />
          <span className={styles.scaleText}>{Math.round(scale * 100)}%</span>
          <Button
            type="text"
            icon={<ZoomInOutlined />}
            onClick={handleZoomIn}
            className={styles.iconButton}
            title={intl.formatMessage({ id: 'imagePreview.zoomIn' })}
          />
        </div>
      </div>

      <div className={styles.imageContainer}>
        {imagePaths.length > 1 && (
          <div className={styles.navAreaLeft} onClick={handlePrev}>
            <div className={styles.navButton}>
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="28"
                height="28"
              >
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </div>
          </div>
        )}

        <div className={styles.imageWrapper}>
          <Image
            src={imagePaths[current]}
            alt={`Image ${current + 1}`}
            className={styles.image}
            preview={false}
            style={{ transform: `scale(${scale})` }}
          />
        </div>

        {imagePaths.length > 1 && (
          <div className={styles.navAreaRight} onClick={handleNext}>
            <div className={styles.navButton}>
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="28"
                height="28"
              >
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {imagePaths.length > 1 && (
        <div className={styles.thumbnails}>
          <div className={styles.thumbnailScroll}>
            {imagePaths.map((path, index) => (
              <div
                key={index}
                className={`${styles.thumbnail} ${
                  index === current ? styles.active : ''
                }`}
                onClick={() => {
                  setCurrent(index);
                  setScale(1);
                }}
              >
                <Image
                  src={path}
                  alt={`Thumbnail ${index + 1}`}
                  className={styles.thumbnailImage}
                  preview={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImagePreview;
