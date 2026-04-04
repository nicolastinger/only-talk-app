import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AudioMutedOutlined,
  AudioOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { MediaConfig, MediaControl, MediaControlState } from '@workspace/types';
import { Button, message, Spin, Tooltip } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './index.module.less';

interface PrivacyVideoCallProps {
  friendId: string;
  onClose?: () => void;
}

const PrivacyVideoCall: React.FC<PrivacyVideoCallProps> = ({ friendId, onClose }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const videoBufferQueueRef = useRef<Uint8Array[]>([]);
  const audioBufferQueueRef = useRef<ArrayBuffer[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [mediaState, setMediaState] = useState<MediaControlState>({
    videoEnabled: true,
    audioEnabled: true,
    isPaused: false,
    isInCall: false,
  });

  const unlistenRef = useRef<(() => void)[]>([]);

  const defaultMediaConfig: MediaConfig = {
    video_config: {
      width: 640,
      height: 480,
      fps: 15,
      audio: true,
      video: true,
      encode: 'video/webm;codecs=vp8',
      bitrate: 500000,
    },
    audio_config: {
      sample_rate: 48000,
      channels: 1,
      encode: 'audio/webm;codecs=opus',
      bitrate: 32000,
      echo_cancellation: true,
      noise_suppression: true,
      auto_gain_control: true,
    },
    buffer_config: {
      video_buffer_size: 5,
      audio_buffer_size: 10,
      adaptive_buffer: true,
      max_latency_ms: 200,
    },
  };

  const initLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: defaultMediaConfig.video_config.width },
          height: { ideal: defaultMediaConfig.video_config.height },
          frameRate: { ideal: defaultMediaConfig.video_config.fps },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: defaultMediaConfig.audio_config.echo_cancellation,
          noiseSuppression: defaultMediaConfig.audio_config.noise_suppression,
          autoGainControl: defaultMediaConfig.audio_config.auto_gain_control,
          sampleRate: defaultMediaConfig.audio_config.sample_rate,
          channelCount: defaultMediaConfig.audio_config.channels,
        },
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await invoke('send_p2p_media_config', {
        mediaConfig: JSON.stringify(defaultMediaConfig),
        uuid: friendId,
      });

      setIsConnected(true);
      setMediaState((prev) => ({ ...prev, isInCall: true }));
      setIsLoading(false);

      startMediaRecording(stream);
    } catch (error) {
      console.error('初始化本地媒体失败:', error);
      message.error('无法访问摄像头或麦克风');
      setIsLoading(false);
    }
  }, [friendId]);

  const startMediaRecording = (stream: MediaStream) => {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (videoTrack) {
      const videoStream = new MediaStream([videoTrack]);
      const videoRecorder = new MediaRecorder(videoStream, {
        mimeType: defaultMediaConfig.video_config.encode,
        videoBitsPerSecond: defaultMediaConfig.video_config.bitrate,
      });

      videoRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          try {
            const buffer = await event.data.arrayBuffer();
            await invoke('send_p2p_video_frame', {
              frameData: Array.from(new Uint8Array(buffer)),
              targetUuid: friendId,
            });
          } catch (error) {
            console.error('发送视频帧失败:', error);
          }
        }
      };

      videoRecorder.start(50);
      mediaRecorderRef.current = videoRecorder;
    }

    if (audioTrack) {
      const audioStream = new MediaStream([audioTrack]);
      const audioRecorder = new MediaRecorder(audioStream, {
        mimeType: defaultMediaConfig.audio_config.encode,
        audioBitsPerSecond: defaultMediaConfig.audio_config.bitrate,
      });

      audioRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          try {
            const buffer = await event.data.arrayBuffer();
            await invoke('send_p2p_audio_frame', {
              audioData: Array.from(new Uint8Array(buffer)),
              targetUuid: friendId,
            });
          } catch (error) {
            console.error('发送音频帧失败:', error);
          }
        }
      };

      audioRecorder.start(20);
      audioRecorderRef.current = audioRecorder;
    }
  };

  const initRemoteMediaReceiver = useCallback(async () => {
    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.src = URL.createObjectURL(mediaSource);
    }

    mediaSource.addEventListener('sourceopen', () => {
      try {
        const buffer = mediaSource.addSourceBuffer(
          defaultMediaConfig.video_config.encode,
        );
        sourceBufferRef.current = buffer;

        buffer.addEventListener('updateend', () => {
          processVideoBufferQueue();
        });
      } catch (error) {
        console.error('创建SourceBuffer失败:', error);
      }
    });

    audioContextRef.current = new AudioContext();
  }, []);

  const processVideoBufferQueue = () => {
    if (
      sourceBufferRef.current &&
      !sourceBufferRef.current.updating &&
      videoBufferQueueRef.current.length > 0
    ) {
      const data = videoBufferQueueRef.current.shift();
      if (data) {
        try {
          sourceBufferRef.current.appendBuffer(data);
        } catch (error) {
          console.error('追加视频缓冲失败:', error);
        }
      }
    }
  };

  const processAudioBufferQueue = () => {
    while (audioBufferQueueRef.current.length > 0) {
      const data = audioBufferQueueRef.current.shift();
      if (data && audioContextRef.current) {
        audioContextRef.current.decodeAudioData(data, (buffer) => {
          const source = audioContextRef.current!.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContextRef.current!.destination);
          source.start();
        });
      }
    }
  };

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenVideo = await listen<number[]>('video_frame', (event) => {
        if (event.payload.length > 0) {
          const data = new Uint8Array(event.payload);
          if (
            sourceBufferRef.current &&
            !sourceBufferRef.current.updating
          ) {
            try {
              sourceBufferRef.current.appendBuffer(data);
            } catch {
              videoBufferQueueRef.current.push(data);
            }
          } else {
            videoBufferQueueRef.current.push(data);
          }
        }
      });

      const unlistenAudio = await listen<number[]>('audio_frame', (event) => {
        if (event.payload.length > 0 && audioContextRef.current) {
          const data = new Uint8Array(event.payload).buffer;
          audioBufferQueueRef.current.push(data);
          processAudioBufferQueue();
        }
      });

      const unlistenControl = await listen<string>('media_control', (event) => {
        try {
          const control: MediaControl = JSON.parse(event.payload);
          handleMediaControl(control);
        } catch (error) {
          console.error('处理媒体控制失败:', error);
        }
      });

      unlistenRef.current = [unlistenVideo, unlistenAudio, unlistenControl];
    };

    setupListeners();

    return () => {
      unlistenRef.current.forEach((unlisten) => unlisten());
    };
  }, []);

  const handleMediaControl = (control: MediaControl) => {
    switch (control.control_type) {
      case 'VideoToggle':
        setMediaState((prev) => ({ ...prev, videoEnabled: control.enabled }));
        break;
      case 'AudioToggle':
        setMediaState((prev) => ({ ...prev, audioEnabled: control.enabled }));
        break;
      case 'Pause':
        setMediaState((prev) => ({ ...prev, isPaused: true }));
        break;
      case 'Resume':
        setMediaState((prev) => ({ ...prev, isPaused: false }));
        break;
      case 'EndCall':
        handleEndCall();
        break;
    }
  };

  const toggleVideo = async () => {
    const newState = !mediaState.videoEnabled;
    setMediaState((prev) => ({ ...prev, videoEnabled: newState }));

    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = newState;
      }
    }

    await invoke('send_p2p_media_control', {
      controlType: 'VideoToggle',
      enabled: newState,
      targetUuid: friendId,
    });
  };

  const toggleAudio = async () => {
    const newState = !mediaState.audioEnabled;
    setMediaState((prev) => ({ ...prev, audioEnabled: newState }));

    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = newState;
      }
    }

    await invoke('send_p2p_media_control', {
      controlType: 'AudioToggle',
      enabled: newState,
      targetUuid: friendId,
    });
  };

  const handleEndCall = useCallback(async () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    await invoke('send_p2p_media_control', {
      controlType: 'EndCall',
      enabled: false,
      targetUuid: friendId,
    });

    setMediaState((prev) => ({ ...prev, isInCall: false }));
    onClose?.();
  }, [friendId, onClose]);

  useEffect(() => {
    const init = async () => {
      await initRemoteMediaReceiver();
      await initLocalMedia();
    };

    init();

    return () => {
      handleEndCall();
    };
  }, [initLocalMedia, initRemoteMediaReceiver, handleEndCall]);

  return (
    <div className={styles.videoCallContainer}>
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <Spin size="large" tip="正在建立视频连接..." />
        </div>
      )}

      <div className={styles.videoWrapper}>
        <div className={styles.remoteVideo}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={styles.video}
          />
          {!isConnected && (
            <div className={styles.waitingOverlay}>
              <span>等待对方连接...</span>
            </div>
          )}
        </div>

        <div className={styles.localVideo}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={styles.video}
          />
          {!mediaState.videoEnabled && (
            <div className={styles.videoOffOverlay}>
              <VideoCameraOutlined style={{ fontSize: 32 }} />
            </div>
          )}
        </div>
      </div>

      <div className={styles.controls}>
        <Tooltip title={mediaState.audioEnabled ? '关闭麦克风' : '开启麦克风'}>
          <Button
            type={mediaState.audioEnabled ? 'primary' : 'default'}
            shape="circle"
            size="large"
            icon={
              mediaState.audioEnabled ? (
                <AudioOutlined />
              ) : (
                <AudioMutedOutlined />
              )
            }
            onClick={toggleAudio}
            className={styles.controlButton}
          />
        </Tooltip>

        <Tooltip title={mediaState.videoEnabled ? '关闭摄像头' : '开启摄像头'}>
          <Button
            type={mediaState.videoEnabled ? 'primary' : 'default'}
            shape="circle"
            size="large"
            icon={<VideoCameraOutlined />}
            onClick={toggleVideo}
            className={styles.controlButton}
          />
        </Tooltip>

        <Tooltip title="结束通话">
          <Button
            type="primary"
            danger
            shape="circle"
            size="large"
            icon={<PhoneOutlined />}
            onClick={handleEndCall}
            className={styles.endCallButton}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default React.memo(PrivacyVideoCall);
