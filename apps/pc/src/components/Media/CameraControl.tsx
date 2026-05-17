import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import React, { useEffect, useRef, useState } from 'react';
import styles from './style/CameraControl.module.css';

interface CameraControlProps {
  onStreamReady?: (stream: MediaStream) => void;
  isReceiver?: boolean;
  uuid: string;
  callType?: string;
  remoteStream?: MediaStream;
}

const CameraControl = React.forwardRef(
  (
    {
      onStreamReady,
      isReceiver = false,
      remoteStream,
      uuid,
    }: CameraControlProps,
    ref,
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string>('');
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
      [],
    );
    const [selectedCamera, setSelectedCamera] = useState<string>('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    const videoConfig = useBearStore((state) => state.videoConfig);
    const setVideoConfig = useBearStore((state) => state.setVideoConfig);

    // 暴露方法给父组件
    React.useImperativeHandle(ref, () => ({
      startCamera,
      stopCamera,
      switchCamera,
      isCameraOn: () => isCameraOn,
    }));

    useEffect(() => {
      console.log('videoConfig', videoConfig, uuid);
      // 发送视频配置
      invoke('send_p2p_video_config', {
        videoConfig: JSON.stringify(videoConfig),
        uuid: uuid,
      });
    }, [videoConfig]);

    // 获取可用的摄像头设备
    const getAvailableCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === 'videoinput',
        );
        setAvailableCameras(videoDevices);

        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (err) {
        setError('无法获取摄像头列表');
        console.error('获取摄像头列表失败:', err);
      }
    };

    // 启动摄像头
    const startCamera = async () => {
      try {
        // 发送开始信号到 Rust 后端
        let startBuffer = new ArrayBuffer(7);
        await invoke('send_video_frame', {
          frameData: Array.from(new Uint8Array(startBuffer)),
          uuid,
        });
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
            width: { ideal: videoConfig.width },
            height: { ideal: videoConfig.height },
            facingMode: 'user',
            frameRate: videoConfig.fps,
          },
          audio: videoConfig.audio,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        setStream(mediaStream);
        setIsCameraOn(true);

        if (onStreamReady) {
          //onStreamReady(mediaStream);
        }

        // 使用 MediaRecorder 捕获视频流
        if (isReceiver) {
          // 检查浏览器支持的编码格式
          const mimeType = videoConfig.encode;
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            console.error('当前浏览器不支持 VP8 编码');
            setError('当前浏览器不支持 VP8 编码，请尝试使用其他浏览器');
            return;
          }

          try {
            const mediaRecorder = new MediaRecorder(mediaStream, {
              mimeType: mimeType,
              videoBitsPerSecond: videoConfig.bitrate, // 1 Mbps
            });

            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.onerror = (event) => {
              console.error('MediaRecorder 错误:', event);
              setError('视频录制出现错误');
            };

            mediaRecorder.ondataavailable = async (event) => {
              if (event.data.size > 0) {
                try {
                  // 将视频数据转换为 ArrayBuffer
                  const arrayBuffer = await event.data.arrayBuffer();

                  // 发送到 Rust 后端
                  await invoke('send_video_frame', {
                    frameData: Array.from(new Uint8Array(arrayBuffer)),
                    uuid,
                  });
                } catch (err) {
                  console.error('发送视频帧失败:', err);
                }
              } else {
                console.warn('收到空的视频帧数据');
              }
            };

            // 每 30ms 捕获一次数据
            mediaRecorder.start(30);
          } catch (err) {
            console.error('创建 MediaRecorder 失败:', err);
            setError('创建视频录制器失败');
          }
        }
      } catch (err) {
        setError('无法访问摄像头');
        console.error('启动摄像头失败:', err);
      }
    };

    // 停止摄像头
    const stopCamera = () => {
      if (stream) {
        // 发送开始信号到 Rust 后端
        let startBuffer = new ArrayBuffer(8);
        invoke('send_video_frame', {
          frameData: Array.from(new Uint8Array(startBuffer)),
          uuid,
        });
        stream.getTracks().forEach((track) => track.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setStream(null);
        setIsCameraOn(false);

        // 停止 MediaRecorder
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== 'inactive'
        ) {
          mediaRecorderRef.current.stop();
        }
      }
    };

    // 切换摄像头
    const switchCamera = async () => {
      if (stream) {
        stopCamera();
        const currentIndex = availableCameras.findIndex(
          (cam) => cam.deviceId === selectedCamera,
        );
        const nextIndex = (currentIndex + 1) % availableCameras.length;
        setSelectedCamera(availableCameras[nextIndex].deviceId);
        await startCamera();
      }
    };

    // 处理远程视频流
    useEffect(() => {
      if (isReceiver && remoteStream && videoRef.current) {
        videoRef.current.srcObject = remoteStream;
      }
    }, [isReceiver, remoteStream]);

    // 组件挂载时获取可用摄像头
    useEffect(() => {
      if (!isReceiver) {
        getAvailableCameras();
      }
      return () => {
        stopCamera();
      };
    }, [isReceiver]);

    return (
      <div className={styles.cameraControl}>
        <div className={styles.videoContainer}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.videoPreview}
          />
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        {!isReceiver && (
          <>
            <div className={styles.controls}>
              {false && (
                <button
                  onClick={isCameraOn ? stopCamera : startCamera}
                  className={styles.controlButton}
                >
                  {isCameraOn ? '关闭摄像头' : '开启摄像头'}
                </button>
              )}

              {isCameraOn && availableCameras.length > 1 && (
                <button onClick={switchCamera} className={styles.controlButton}>
                  切换摄像头
                </button>
              )}
            </div>

            {availableCameras.length > 1 && (
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className={styles.cameraSelect}
              >
                {availableCameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `摄像头 ${camera.deviceId.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
    );
  },
);

export default React.memo(CameraControl);
