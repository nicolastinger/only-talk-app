import { LeftOutlined, RightOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Image } from 'antd';
import React, { useState, useEffect } from 'react';
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
  const [current, setCurrent] = useState(currentIndex);

  useEffect(() => {
    setCurrent(currentIndex);
  }, [currentIndex]);

  const handlePrev = () => {
    setCurrent((prev) => (prev > 0 ? prev - 1 : imagePaths.length - 1));
  };

  const handleNext = () => {
    setCurrent((prev) => (prev < imagePaths.length - 1 ? prev + 1 : 0));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    } else if (e.key === 'Escape') {
      onClose?.();
    }
  };

  if (imagePaths.length === 0) {
    return null;
  }

  return (
    <div className={styles.container} onKeyDown={handleKeyDown} tabIndex={0}>
      <div className={styles.header}>
        <span className={styles.counter}>
          {current + 1} / {imagePaths.length}
        </span>
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={onClose}
          className={styles.closeButton}
        />
      </div>
      
      <div className={styles.imageContainer}>
        {imagePaths.length > 1 && (
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={handlePrev}
            className={styles.navButton}
            style={{ left: 16 }}
          />
        )}
        
        <Image
          src={imagePaths[current]}
          alt={`Image ${current + 1}`}
          className={styles.image}
          preview={false}
        />
        
        {imagePaths.length > 1 && (
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={handleNext}
            className={styles.navButton}
            style={{ right: 16 }}
          />
        )}
      </div>
      
      {imagePaths.length > 1 && (
        <div className={styles.thumbnails}>
          {imagePaths.map((path, index) => (
            <div
              key={index}
              className={`${styles.thumbnail} ${index === current ? styles.active : ''}`}
              onClick={() => setCurrent(index)}
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
      )}
    </div>
  );
};

export default ImagePreview;