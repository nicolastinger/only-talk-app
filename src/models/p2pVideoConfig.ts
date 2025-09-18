import { useState } from 'react';
import { VideoConfig } from '@/types/p2p';

const useP2pVideoConfig = () => {
  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    width: 1280,
    height: 720,
    fps: 30,
    audio: true,
    video: true,
    encode: 'video/webm;codecs=vp8',
    bitrate: 1024 * 1024 * 1.2,
  });
  return {
    videoConfig,
    setVideoConfig,
  };
};

export default useP2pVideoConfig;
