import React, { useEffect, useRef, useState } from 'react';
import { P2pVideoControl } from '@workspace/types';
import { LOW_QUALITY_VIDEO_CONFIG } from '@/services/privacyVideoService';

interface RemoteVideoRendererProps {
  width?: number;
  height?: number;
  onVideoFrame: (callback: (data: Uint8Array) => void) => void;
  onAudioFrame: (callback: (data: Uint8Array) => void) => void;
  onControlMessage: (callback: (control: P2pVideoControl) => void) => void;
}

const RemoteVideoRenderer: React.FC<RemoteVideoRendererProps> = ({
  width = LOW_QUALITY_VIDEO_CONFIG.width,
  height = LOW_QUALITY_VIDEO_CONFIG.height,
  onVideoFrame,
  onAudioFrame,
  onControlMessage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<Int16Array[]>([]);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(true);
  const [isRemoteAudioEnabled, setIsRemoteAudioEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    audioContextRef.current = new AudioContext({ sampleRate: 16000 });

    onVideoFrame((data: Uint8Array) => {
      if (!isRemoteVideoEnabled || !ctx) return;

      const pixelCount = data.length / 3;
      const imageData = ctx.createImageData(width, height);

      for (let i = 0; i < pixelCount; i++) {
        imageData.data[i * 4] = data[i * 3];
        imageData.data[i * 4 + 1] = data[i * 3 + 1];
        imageData.data[i * 4 + 2] = data[i * 3 + 2];
        imageData.data[i * 4 + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      setIsConnected(true);
    });

    onAudioFrame((data: Uint8Array) => {
      if (!isRemoteAudioEnabled || !audioContextRef.current) return;

      const int16Data = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) {
        int16Data[i] = (data[i] - 128) * 256;
      }

      audioBufferRef.current.push(int16Data);

      if (audioBufferRef.current.length > 3) {
        playAudioBuffer();
      }
    });

    onControlMessage((control: P2pVideoControl) => {
      console.log('[RemoteVideoRenderer] 收到控制消息:', control);
      switch (control.control_type) {
        case 'video_on':
          setIsRemoteVideoEnabled(true);
          break;
        case 'video_off':
          setIsRemoteVideoEnabled(false);
          if (ctx) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('视频已关闭', width / 2, height / 2);
          }
          break;
        case 'audio_on':
          setIsRemoteAudioEnabled(true);
          break;
        case 'audio_off':
          setIsRemoteAudioEnabled(false);
          break;
        case 'stop':
          setIsConnected(false);
          break;
      }
    });

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      audioBufferRef.current = [];
    };
  }, [width, height, isRemoteVideoEnabled, isRemoteAudioEnabled, onVideoFrame, onAudioFrame, onControlMessage]);

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

  return (
    <div className="remote-video-container">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="remote-video-canvas"
      />
      {!isConnected && (
        <div className="remote-video-placeholder">
          <span>等待连接...</span>
        </div>
      )}
      <div className="remote-video-status">
        <span className={`status-dot ${isRemoteVideoEnabled ? 'active' : 'inactive'}`} />
        <span>视频</span>
        <span className={`status-dot ${isRemoteAudioEnabled ? 'active' : 'inactive'}`} />
        <span>音频</span>
      </div>
    </div>
  );
};

export default RemoteVideoRenderer;
