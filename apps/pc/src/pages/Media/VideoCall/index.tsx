import CameraControl from '@/components/Media/CameraControl';
import VideoReceiver from '@/components/Media/VideoReceiver';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useIntl, useLocation } from '@umijs/max';
import { VideoConfig } from '@workspace/types';
import { Button } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import styles from './index.less';

const VideoCallPage: React.FC = () => {
  const intl = useIntl();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';
  // 默认接受,1-客户端,0-服务端
  const callType = params.get('callType') || '1';
  console.log('callType', callType, friendId);
  const [showMe, setShowMe] = useState(false);
  const cameraRef = useRef<any>(null);
  const [isReceiver, setIsReceiver] = useState(false);

  useEffect(() => {
    // 获取对方的视频流配置
    getTargetVideoConfig();
  }, []);

  // 获取对方的视频流配置
  const getTargetVideoConfig = async () => {
    let flag = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      // 调用方法获取flag的值
      let data = await getVideoConfig(friendId);
      if (data !== null) {
        console.log('对方视频配置:', data);
        setIsReceiver(true);
        flag = true;
        break;
      }
    }
    if (!flag) {
      alert(intl.formatMessage({ id: 'media.remoteVideoNotEnabled' }));
    }
  };

  const getVideoConfig = async (uuid: string): Promise<string | null> => {
    try {
      const data: string = await invoke('get_user_map', {
        key: 'p2p_video_config_' + uuid,
      });
      console.log('视频配置', data);
      return data;
    } catch (e) {
      console.log('获取视频配置失败:', e);
      return null;
    }
  };

  const handleStreamReady = (stream: MediaStream) => {
    console.log('摄像头流已就绪:', stream);
  };

  const handleStartCamera = async () => {
    if (cameraRef.current) {
      await cameraRef.current.startCamera();
    }
  };

  const handleStopCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.stopCamera();
    }
  };

  const handleSwitchCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.switchCamera();
    }
  };

  const handleVideoConfig = (config: VideoConfig) => {
    console.log('对方视频配置:', config);
  };

  return (
    <div className={styles.container}>
      <div
        onClick={() => setShowMe(!showMe)}
        className={showMe ? styles.mainVideo : styles.miniVideo}
      >
        <div>{intl.formatMessage({ id: 'media.capture' })}</div>
        <CameraControl
          isReceiver={isReceiver}
          callType={callType}
          uuid={friendId}
          ref={cameraRef}
          onStreamReady={handleStreamReady}
        />
      </div>

      {isReceiver && (
        <div className={styles.btnList}>
          <div className={styles.btnContainer}>
            <Button
              onClick={handleStopCamera}
              variant="solid"
              color="danger"
              icon={<CloseOutlined />}
            >
              {intl.formatMessage({ id: 'media.closeCamera' })}
            </Button>
            <Button
              onClick={handleStartCamera}
              variant="solid"
              color="cyan"
              icon={<CheckOutlined />}
            >
              {intl.formatMessage({ id: 'media.openCamera' })}
            </Button>
          </div>
        </div>
      )}

      <div
        onClick={() => setShowMe(!showMe)}
        className={showMe ? styles.miniVideo : styles.mainVideo}
      >
        <div>{intl.formatMessage({ id: 'media.receive' })}</div>
        <VideoReceiver />
      </div>
    </div>
  );
};

export default VideoCallPage;
