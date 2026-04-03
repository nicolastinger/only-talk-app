import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { P2pVideoControl, VideoConfig } from '@workspace/types';

const LOW_QUALITY_VIDEO_CONFIG: VideoConfig = {
  width: 320,
  height: 240,
  fps: 15,
  audio: true,
  video: true,
  encode: 'vp8',
  bitrate: 200000,
};

const AUDIO_CONFIG = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 16000,
  channelCount: 1,
};

const VIDEO_BUFFER_SIZE = 5;

class PrivacyVideoService {
  private localStream: MediaStream | null = null;
  private videoSender: MediaStreamTrack | null = null;
  private audioSender: MediaStreamTrack | null = null;
  private isVideoEnabled: boolean = true;
  private isAudioEnabled: boolean = true;
  private targetUuid: string = '';
  private videoFrameInterval: NodeJS.Timeout | null = null;
  private audioContext: AudioContext | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private videoCanvas: HTMLCanvasElement | null = null;
  private videoCanvasCtx: CanvasRenderingContext2D | null = null;
  private localVideoElement: HTMLVideoElement | null = null;
  private frameBuffer: Uint8Array[] = [];
  private isRunning: boolean = false;
  private unlisteners: (() => void)[] = [];

  async initLocalStream(video: boolean = true, audio: boolean = true): Promise<MediaStream> {
    console.log('[PrivacyVideoService] 初始化本地媒体流 - 视频:', video, '音频:', audio);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: LOW_QUALITY_VIDEO_CONFIG.width },
          height: { ideal: LOW_QUALITY_VIDEO_CONFIG.height },
          facingMode: 'user',
          frameRate: { ideal: LOW_QUALITY_VIDEO_CONFIG.fps }
        } : false,
        audio: audio ? AUDIO_CONFIG : false
      });

      this.localStream = stream;
      this.isVideoEnabled = video;
      this.isAudioEnabled = audio;

      if (video) {
        this.videoSender = stream.getVideoTracks()[0];
      }
      if (audio) {
        this.audioSender = stream.getAudioTracks()[0];
      }

      console.log('[PrivacyVideoService] 本地媒体流初始化成功');
      return stream;
    } catch (error) {
      console.error('[PrivacyVideoService] 初始化本地媒体流失败:', error);
      throw error;
    }
  }

  async startVideoCapture(targetUuid: string, videoElement: HTMLVideoElement): Promise<void> {
    console.log('[PrivacyVideoService] 开始视频采集');
    this.targetUuid = targetUuid;
    this.localVideoElement = videoElement;
    this.isRunning = true;

    if (videoElement && this.localStream) {
      videoElement.srcObject = this.localStream;
      await videoElement.play();
    }

    this.videoCanvas = document.createElement('canvas');
    this.videoCanvas.width = LOW_QUALITY_VIDEO_CONFIG.width;
    this.videoCanvas.height = LOW_QUALITY_VIDEO_CONFIG.height;
    this.videoCanvasCtx = this.videoCanvas.getContext('2d', { willReadFrequently: true });

    await this.sendVideoConfig();

    this.startVideoFrameSending();
    await this.startAudioCapture();
  }

  private startVideoFrameSending(): void {
    if (!this.isVideoEnabled || !this.videoCanvasCtx || !this.localVideoElement) {
      console.log('[PrivacyVideoService] 视频未启用或缺少必要元素');
      return;
    }

    const frameInterval = 1000 / LOW_QUALITY_VIDEO_CONFIG.fps;

    this.videoFrameInterval = setInterval(async () => {
      if (!this.isRunning || !this.isVideoEnabled) return;

      try {
        if (this.localVideoElement && this.videoCanvasCtx && this.videoCanvas) {
          this.videoCanvasCtx.drawImage(
            this.localVideoElement,
            0, 0,
            LOW_QUALITY_VIDEO_CONFIG.width,
            LOW_QUALITY_VIDEO_CONFIG.height
          );

          const imageData = this.videoCanvasCtx.getImageData(
            0, 0,
            LOW_QUALITY_VIDEO_CONFIG.width,
            LOW_QUALITY_VIDEO_CONFIG.height
          );

          const frameData = this.rgbaToRgb(imageData.data);

          if (this.frameBuffer.length < VIDEO_BUFFER_SIZE) {
            this.frameBuffer.push(frameData);
          }

          while (this.frameBuffer.length > 0) {
            const data = this.frameBuffer.shift();
            if (data) {
              try {
                await invoke('send_p2p_video_frame', {
                  frameData: Array.from(data),
                  targetUuid: this.targetUuid,
                });
              } catch (e) {
                console.error('[PrivacyVideoService] 发送视频帧失败:', e);
              }
            }
          }
        }
      } catch (error) {
        console.error('[PrivacyVideoService] 视频帧处理错误:', error);
      }
    }, frameInterval);
  }

  private rgbaToRgb(rgbaData: Uint8ClampedArray): Uint8Array {
    const pixelCount = rgbaData.length / 4;
    const rgbData = new Uint8Array(pixelCount * 3);

    for (let i = 0; i < pixelCount; i++) {
      rgbData[i * 3] = rgbaData[i * 4];
      rgbData[i * 3 + 1] = rgbaData[i * 4 + 1];
      rgbData[i * 3 + 2] = rgbaData[i * 4 + 2];
    }

    return rgbData;
  }

  private async startAudioCapture(): Promise<void> {
    if (!this.isAudioEnabled || !this.localStream) {
      console.log('[PrivacyVideoService] 音频未启用');
      return;
    }

    try {
      this.audioContext = new AudioContext({ sampleRate: AUDIO_CONFIG.sampleRate });
      
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (!audioTrack) {
        console.log('[PrivacyVideoService] 没有音频轨道');
        return;
      }

      const audioStream = new MediaStream([audioTrack]);
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(audioStream);

      const bufferSize = 4096;
      const scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      scriptProcessor.onaudioprocess = async (event) => {
        if (!this.isRunning || !this.isAudioEnabled) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = this.float32ToUint8(inputData);

        try {
          await invoke('send_p2p_audio_frame', {
            audioData: Array.from(pcmData),
            targetUuid: this.targetUuid,
          });
        } catch (e) {
          console.error('[PrivacyVideoService] 发送音频帧失败:', e);
        }
      };

      this.mediaStreamSource.connect(scriptProcessor);
      scriptProcessor.connect(this.audioContext.destination);

      console.log('[PrivacyVideoService] 音频采集已启动');
    } catch (error) {
      console.error('[PrivacyVideoService] 启动音频采集失败:', error);
    }
  }

  private float32ToUint8(float32Data: Float32Array): Uint8Array {
    const uint8Data = new Uint8Array(float32Data.length);
    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]));
      uint8Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      uint8Data[i] = uint8Data[i] >> 8;
    }
    return uint8Data;
  }

  private async sendVideoConfig(): Promise<void> {
    const config: VideoConfig = {
      ...LOW_QUALITY_VIDEO_CONFIG,
      video: this.isVideoEnabled,
      audio: this.isAudioEnabled,
    };

    try {
      await invoke('send_p2p_video_config', {
        videoConfig: JSON.stringify(config),
        uuid: this.targetUuid,
      });
      console.log('[PrivacyVideoService] 视频配置已发送');
    } catch (error) {
      console.error('[PrivacyVideoService] 发送视频配置失败:', error);
    }
  }

  async toggleVideo(): Promise<boolean> {
    console.log('[PrivacyVideoService] 切换视频状态');
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        this.isVideoEnabled = !this.isVideoEnabled;
        videoTrack.enabled = this.isVideoEnabled;

        await invoke('send_p2p_video_control', {
          controlType: this.isVideoEnabled ? 'video_on' : 'video_off',
          targetUuid: this.targetUuid,
        });

        if (this.isVideoEnabled) {
          this.startVideoFrameSending();
        } else if (this.videoFrameInterval) {
          clearInterval(this.videoFrameInterval);
          this.videoFrameInterval = null;
        }

        console.log('[PrivacyVideoService] 视频状态:', this.isVideoEnabled ? '开启' : '关闭');
        return this.isVideoEnabled;
      }
    }
    return false;
  }

  async toggleAudio(): Promise<boolean> {
    console.log('[PrivacyVideoService] 切换音频状态');
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        this.isAudioEnabled = !this.isAudioEnabled;
        audioTrack.enabled = this.isAudioEnabled;

        await invoke('send_p2p_video_control', {
          controlType: this.isAudioEnabled ? 'audio_on' : 'audio_off',
          targetUuid: this.targetUuid,
        });

        console.log('[PrivacyVideoService] 音频状态:', this.isAudioEnabled ? '开启' : '关闭');
        return this.isAudioEnabled;
      }
    }
    return false;
  }

  getVideoEnabled(): boolean {
    return this.isVideoEnabled;
  }

  getAudioEnabled(): boolean {
    return this.isAudioEnabled;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async setupRemoteVideoListeners(
    onVideoFrame: (data: Uint8Array) => void,
    onAudioFrame: (data: Uint8Array) => void,
    onControlMessage: (control: P2pVideoControl) => void
  ): Promise<void> {
    const videoUnlisten = await listen<Uint8Array>('video_frame', (event) => {
      onVideoFrame(new Uint8Array(event.payload));
    });
    this.unlisteners.push(videoUnlisten);

    const audioUnlisten = await listen<Uint8Array>('audio_frame', (event) => {
      onAudioFrame(new Uint8Array(event.payload));
    });
    this.unlisteners.push(audioUnlisten);

    const controlUnlisten = await listen<string>('p2p_video_control', (event) => {
      try {
        const control = JSON.parse(event.payload) as P2pVideoControl;
        onControlMessage(control);
      } catch (e) {
        console.error('[PrivacyVideoService] 解析控制消息失败:', e);
      }
    });
    this.unlisteners.push(controlUnlisten);

    console.log('[PrivacyVideoService] 远程视频监听器已设置');
  }

  stopAll(): void {
    console.log('[PrivacyVideoService] 停止所有服务');
    this.isRunning = false;

    if (this.videoFrameInterval) {
      clearInterval(this.videoFrameInterval);
      this.videoFrameInterval = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.videoSender = null;
    this.audioSender = null;
    this.videoCanvas = null;
    this.videoCanvasCtx = null;
    this.localVideoElement = null;
    this.frameBuffer = [];

    this.unlisteners.forEach(unlisten => unlisten());
    this.unlisteners = [];

    console.log('[PrivacyVideoService] 所有服务已停止');
  }
}

let privacyVideoServiceInstance: PrivacyVideoService | null = null;

export const initPrivacyVideoService = (): PrivacyVideoService => {
  if (!privacyVideoServiceInstance) {
    privacyVideoServiceInstance = new PrivacyVideoService();
  }
  return privacyVideoServiceInstance;
};

export const getPrivacyVideoService = (): PrivacyVideoService | null => {
  return privacyVideoServiceInstance;
};

export { PrivacyVideoService, LOW_QUALITY_VIDEO_CONFIG };
