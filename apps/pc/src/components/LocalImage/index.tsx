import React from 'react';

interface LocalImageProps {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
  alt?: string;
}

const LocalImage: React.FC<LocalImageProps> = ({
  width = 200,
  height = 200,
  style,
  className,
  alt = 'Local Image',
}) => {
  return (
    <img
      src="/images/default.jpg"
      alt={alt}
      width={width}
      height={height}
      style={{
        objectFit: 'cover',
        ...style,
      }}
      className={className}
    />
  );
};

export default LocalImage;
