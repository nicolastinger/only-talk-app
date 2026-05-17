import { listen } from '@tauri-apps/api/event';
import React, { useEffect, useRef, useState } from 'react';
import styles from './style/VideoReceiver.module.css';

const VideoReceiver = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const [isMediaSourceOpen, setIsMediaSourceOpen] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const [restart, setRestart] = useState(0);
  const [isReceiving, setIsReceiving] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 创建 MediaSource
    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    video.src = URL.createObjectURL(mediaSource);

    // 等待 MediaSource 打开
    const handleSourceOpen = async () => {
      try {
        // 创建 SourceBuffer
        sourceBufferRef.current = mediaSource.addSourceBuffer(
          'video/webm;codecs=vp8',
        );
        setIsMediaSourceOpen(true);
        let initFlag = false;

        // 监听视频帧事件
        unlistenRef.current = await listen<number[]>('video_frame', (event) => {
          console.log('流长度', event.payload.length);
          if (!sourceBufferRef.current) {
            console.warn('MediaSource 未就绪或已关闭');
            return;
          }

          // 开始信号
          if (!initFlag && event.payload.length === 7) {
            console.log('初始化信息', event.payload);
            const isSignal = event.payload.find((item) => item === 1);
            if (isSignal === undefined) {
              console.log('收到开始信号，开始接收视频数据');
              initFlag = true;
              setIsReceiving(true);
              return;
            }
          }

          // 结束信号
          if (initFlag && event.payload.length === 8) {
            const isSignal = event.payload.find((item) => item === 1);
            if (isSignal === undefined) {
              console.log('收到停止信号，停止接收视频数据');
              // 重置状态，准备接收下一次开始信号
              setIsReceiving(false);
              setRestart((prevState) => prevState + 1);
              return;
            }
          }

          if (initFlag && event.payload.length > 0) {
            try {
              // 将数据转换为 ArrayBuffer
              const arrayBuffer = new Uint8Array(event.payload).buffer;

              // 如果 SourceBuffer 正在更新，等待它完成
              if (sourceBufferRef.current.updating) {
                const handleUpdateEnd = () => {
                  try {
                    if (sourceBufferRef.current && isMediaSourceOpen) {
                      sourceBufferRef.current.appendBuffer(arrayBuffer);
                    }
                  } catch (err) {
                    console.error('追加视频帧失败:', err);
                  }
                  sourceBufferRef.current?.removeEventListener(
                    'updateend',
                    handleUpdateEnd,
                  );
                };
                sourceBufferRef.current.addEventListener(
                  'updateend',
                  handleUpdateEnd,
                  { once: true },
                );
              } else {
                sourceBufferRef.current.appendBuffer(arrayBuffer);
              }
            } catch (err) {
              console.error('处理视频帧失败:', err);
            }
          }
        });
      } catch (err) {
        console.error('初始化视频接收器失败:', err);
      }
    };

    mediaSource.addEventListener('sourceopen', handleSourceOpen);

    return () => {
      // 清理资源
      if (unlistenRef.current) {
        unlistenRef.current();
      }

      if (mediaSourceRef.current) {
        if (mediaSourceRef.current.readyState === 'open') {
          try {
            if (sourceBufferRef.current) {
              mediaSourceRef.current.removeSourceBuffer(
                sourceBufferRef.current,
              );
            }
            mediaSourceRef.current.endOfStream();
          } catch (err) {
            console.error('清理 MediaSource 失败:', err);
          }
        }
        URL.revokeObjectURL(video.src);
      }

      setIsMediaSourceOpen(false);
      sourceBufferRef.current = null;
      mediaSourceRef.current = null;
    };
  }, [restart]);

  return (
    <div className={styles.videoReceiver}>
      <div className={styles.videoContainer}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={styles.videoPreview}
        />
        {!isReceiving && (
          <div className={styles.statusOverlay}>
            <span>等待视频信号...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(VideoReceiver);
