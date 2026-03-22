import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Splitter.less';

interface SplitterProps {
  onHeightChange: (height: number) => void;
  minHeight?: number;
  maxHeight?: number;
}

const Splitter: React.FC<SplitterProps> = ({
  onHeightChange,
  minHeight = 20,
  maxHeight = 80,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const splitterRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const containerHeight = window.innerHeight;
      const mouseY = e.clientY;
      const containerTop =
        splitterRef.current?.getBoundingClientRect().top || 0;

      // 计算相对于容器的高度百分比
      const heightPercent =
        ((containerHeight - mouseY) / containerHeight) * 100;

      // 限制在最小和最大高度之间
      const clampedHeight = Math.max(
        minHeight,
        Math.min(maxHeight, heightPercent),
      );

      onHeightChange(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onHeightChange, minHeight, maxHeight]);

  return (
    <div
      ref={splitterRef}
      className={`${styles.splitter} ${isDragging ? styles.dragging : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.handle} />
    </div>
  );
};

export default React.memo(Splitter);
