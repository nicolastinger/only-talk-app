import { LockOutlined, LogoutOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { window } from '@tauri-apps/api';
import { useLocation } from '@umijs/max';
import { Button, Input, message } from 'antd';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './index.less';
import { initPrivacyVideoService, getPrivacyVideoService, LOW_QUALITY_VIDEO_CONFIG } from '@/services/privacyVideoService';
import { VideoControls } from '@/components/PrivacyVideo';
import { P2pVideoControl } from '@workspace/types';

const { TextArea } = Input;

interface P2pTextMessage {
  type: string;
  send_user: string;
  text: string;
  timestamp: number;
}

interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
}

const PrivacyChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';

  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [isP2PConnected, setIsP2PConnected] = useState(false);
  const [remoteVideoData, setRemoteVideoData] = useState<Uint8Array | null>(null);
  const [remoteAudioData, setRemoteAudioData] = useState<Uint8Array | null>(null);
  const [remoteControl, setRemoteControl] = useState<P2pVideoControl | null>(null);

  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<Int16Array[]>([]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('p2p_text_message', (event) => {
          console.log('收到p2p文本消息:', event.payload);
          try {
            const p2pMsg: P2pTextMessage = JSON.parse(event.payload);
            const newMessage: ChatMessageItem = {
              id: `${Date.now()}_${Math.random()}`,
              text: p2pMsg.text,
              isMine: false,
              timestamp: p2pMsg.timestamp || Date.now(),
            };
            setMessages((prev) => [...prev, newMessage]);
          } catch (e) {
            console.error('解析p2p消息失败:', e);
          }
        });
      } catch (e) {
        console.error('监听p2p消息失败:', e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  const startVideoCall = useCallback(async () => {
    try {
      const videoService = getPrivacyVideoService();
      if (!videoService) {
        message.error('视频服务未初始化');
        return;
      }

      await videoService.initLocalStream(true, true);

      if (localVideoRef.current) {
        await videoService.startVideoCapture(friendId, localVideoRef.current);
        setIsVideoCallActive(true);
        setIsVideoEnabled(true);
        setIsAudioEnabled(true);
        message.success('视频通话已开始');
      }
    } catch (error) {
      console.error('启动视频通话失败:', error);
      message.error('启动视频通话失败');
    }
  }, [friendId]);

  useEffect(() => {
    const videoService = initPrivacyVideoService();

    const setupVideoListeners = async () => {
      await videoService.setupRemoteVideoListeners(
        (data) => setRemoteVideoData(data),
        (data) => setRemoteAudioData(data),
        (control) => setRemoteControl(control)
      );
    };

    setupVideoListeners();

    return () => {
      videoService.stopAll();
    };
  }, []);

  useEffect(() => {
    const startVideoCallAuto = async () => {
      console.log('[PrivacyChat] 等待P2P连接建立...');
      
      for (let i = 0; i < 30; i++) {
        try {
          const result = await invoke<string>('check_p2p_connection', { targetUuid: friendId });
          if (result === 'connected') {
            console.log('[PrivacyChat] P2P连接已建立，自动开始视频通话');
            setIsP2PConnected(true);
            await startVideoCall();
            return;
          }
        } catch (e) {
          console.log('[PrivacyChat] 检查P2P连接状态失败:', e);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log('[PrivacyChat] P2P连接超时');
      message.warning('P2P连接建立超时，请手动开始视频通话');
    };

    if (friendId) {
      startVideoCallAuto();
    }
  }, [friendId, startVideoCall]);

  useEffect(() => {
    if (!remoteVideoData || !remoteCanvasRef.current) return;

    const canvas = remoteCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = LOW_QUALITY_VIDEO_CONFIG.width;
    const height = LOW_QUALITY_VIDEO_CONFIG.height;
    const pixelCount = remoteVideoData.length / 3;
    const imageData = ctx.createImageData(width, height);

    for (let i = 0; i < pixelCount; i++) {
      imageData.data[i * 4] = remoteVideoData[i * 3];
      imageData.data[i * 4 + 1] = remoteVideoData[i * 3 + 1];
      imageData.data[i * 4 + 2] = remoteVideoData[i * 3 + 2];
      imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [remoteVideoData]);

  useEffect(() => {
    if (!remoteAudioData) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    }

    const int16Data = new Int16Array(remoteAudioData.length);
    for (let i = 0; i < remoteAudioData.length; i++) {
      int16Data[i] = (remoteAudioData[i] - 128) * 256;
    }

    audioBufferRef.current.push(int16Data);

    if (audioBufferRef.current.length > 3) {
      playAudioBuffer();
    }
  }, [remoteAudioData]);

  useEffect(() => {
    if (!remoteControl) return;

    console.log('收到远程控制消息:', remoteControl);
    switch (remoteControl.control_type) {
      case 'video_on':
        message.info('对方已开启视频');
        break;
      case 'video_off':
        message.info('对方已关闭视频');
        break;
      case 'audio_on':
        message.info('对方已开启麦克风');
        break;
      case 'audio_off':
        message.info('对方已静音');
        break;
      case 'stop':
        message.info('对方已结束视频通话');
        setIsVideoCallActive(false);
        break;
    }
  }, [remoteControl]);

  const playAudioBuffer = () => {
    if (!audioContextRef.current || audioBufferRef.current.length === 0) return;

    const audioContext = audioContextRef.current;
    const buffers = audioBufferRef.current.splice(0, 2);

    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const combinedData = new Int16Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      combinedData.set(buf, offset);
      offset += buf.length;
    }

    const float32Data = new Float32Array(combinedData.length);
    for (let i = 0; i < combinedData.length; i++) {
      float32Data[i] = combinedData[i] / 32768.0;
    }

    const audioBuffer = audioContext.createBuffer(1, float32Data.length, 16000);
    audioBuffer.copyToChannel(float32Data, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  };

  const handleToggleVideo = async () => {
    const videoService = getPrivacyVideoService();
    if (videoService) {
      const newState = await videoService.toggleVideo();
      setIsVideoEnabled(newState);
    }
  };

  const handleToggleAudio = async () => {
    const videoService = getPrivacyVideoService();
    if (videoService) {
      const newState = await videoService.toggleAudio();
      setIsAudioEnabled(newState);
    }
  };

  const handleEndCall = async () => {
    try {
      const videoService = getPrivacyVideoService();
      if (videoService) {
        await invoke('send_p2p_video_control', {
          controlType: 'stop',
          targetUuid: friendId,
        });
        videoService.stopAll();
      }
      setIsVideoCallActive(false);
      message.info('视频通话已结束');
    } catch (error) {
      console.error('结束通话失败:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) {
      return;
    }

    if (!friendId) {
      message.error('无法获取好友ID');
      return;
    }

    try {
      await invoke('send_p2p_text_msg', {
        text: inputText.trim(),
        targetUuid: friendId,
      });

      const newMessage: ChatMessageItem = {
        id: `${Date.now()}_${Math.random()}`,
        text: inputText.trim(),
        isMine: true,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMessage]);
      setInputText('');
    } catch (e) {
      console.error('发送消息失败:', e);
      message.error('发送消息失败');
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleExit = async () => {
    try {
      handleEndCall();
      if (friendId) {
        await invoke('close_p2p_connection', {
          targetUuid: friendId,
        });
      }
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
    } catch (e) {
      console.error('退出失败:', e);
      message.error('退出失败');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <LockOutlined className={styles.privacyIcon} />
          <span className={styles.title}>隐私聊天</span>
        </div>
        <Button
          className={styles.exitBtn}
          type="text"
          danger
          icon={<LogoutOutlined />}
          onClick={handleExit}
        >
          退出
        </Button>
      </div>
      <div className={styles.hint}>
        隐私聊天消息不会保存到本地，关闭窗口后消息将消失
      </div>

      <div className={styles.videoSection}>
        <div className={styles.videoContainer}>
          <div className={styles.localVideo}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={styles.videoElement}
            />
            <div className={styles.videoLabel}>本地视频</div>
          </div>
          <div className={styles.remoteVideo}>
            <canvas
              ref={remoteCanvasRef}
              width={LOW_QUALITY_VIDEO_CONFIG.width}
              height={LOW_QUALITY_VIDEO_CONFIG.height}
              className={styles.videoCanvas}
            />
            <div className={styles.videoLabel}>远程视频</div>
          </div>
        </div>

        <div className={styles.videoControls}>
          {!isVideoCallActive ? (
            <Button type="primary" onClick={startVideoCall}>
              开始视频通话
            </Button>
          ) : (
            <VideoControls
              isVideoEnabled={isVideoEnabled}
              isAudioEnabled={isAudioEnabled}
              onToggleVideo={handleToggleVideo}
              onToggleAudio={handleToggleAudio}
              onEndCall={handleEndCall}
            />
          )}
        </div>
      </div>

      <div ref={messageContainerRef} className={styles.messageContainer}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageItem} ${msg.isMine ? styles.mine : styles.friend}`}
          >
            <div className={styles.messageBubble}>{msg.text}</div>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <div className={styles.inputArea}>
          <TextArea
            className={styles.textArea}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
          <Button type="primary" onClick={sendMessage}>
            发送
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyChat;
