import { invoke } from '@tauri-apps/api/core';
import { Spin } from 'antd';
import React, { useEffect, useState } from 'react';

interface FileVo {
  size?: number;
  file_extension?: string;
  mime_type?: string;
  original_file_name?: string;
  original_file_path?: string;
  relative_path?: string;
  relative_file_name?: string;
  raw?: number[];
  status?: number;
}

interface LocalImageProps {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
  alt?: string;
}

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const chunkSize = 32768;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      buffer.slice(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}

const LocalImage: React.FC<LocalImageProps> = ({
  width = 200,
  height = 200,
  style,
  className,
  alt = 'Local Image',
}) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImage = async () => {
      try {
        setLoading(true);
        setError(null);

        const result: FileVo = await invoke('get_local_file');
        console.log('文件记录', result);

        if (result.raw && result.raw.length > 0) {
          const uint8Array = new Uint8Array(result.raw);
          const base64 = arrayBufferToBase64(uint8Array);
          const mimeType = result.mime_type || 'image/jpeg';
          const dataUrl = `data:${mimeType};base64,${base64}`;
          setImageUrl(dataUrl);
        } else {
          setError('图片数据为空');
        }
      } catch (err) {
        console.error('获取本地图片失败:', err);
        setError(err instanceof Error ? err.message : '获取图片失败');
      } finally {
        setLoading(false);
      }
    };

    fetchImage();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          ...style,
        }}
        className={className}
      >
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          color: '#999',
          fontSize: '12px',
          ...style,
        }}
        className={className}
      >
        {error}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
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
