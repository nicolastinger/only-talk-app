/**
 * P2P 媒体事件监听：类型化注册 Tauri `listen(...)` 事件，
 * 屏蔽 IPC 事件名、payload 序列化差异，向调用方暴露结构化回调。
 */
import { listen } from '@tauri-apps/api/event';
import { MediaControl, MediaInfo } from '@workspace/types';

export interface P2pMediaEventHandlers {
  onVideoFrame: (payload: number[]) => void;
  onAudioFrame: (payload: number[]) => void;
  onMediaControl: (control: MediaControl) => void;
  onVideoCallAccept: (payload: string) => void;
  onVideoCallReject: (payload: string) => void;
  onVideoCallEnd: (payload: string) => void;
  onMediaInfo: (info: MediaInfo) => void;
  onMediaReady: (payload: string) => void;
}

/** 注册全部 P2P 媒体事件，返回取消监听函数数组 */
export async function registerP2pMediaEvents(
  handlers: P2pMediaEventHandlers,
): Promise<Array<() => void>> {
  const unlistenVideo = await listen<number[]>('video_frame', (event) => {
    if (event.payload.length > 0) {
      handlers.onVideoFrame(event.payload);
    }
  });

  const unlistenAudio = await listen<number[]>('audio_frame', (event) => {
    if (event.payload.length > 0) {
      handlers.onAudioFrame(event.payload);
    }
  });

  const unlistenControl = await listen<string>('media_control', (event) => {
    try {
      // 兼容处理：payload 可能是 string 或 object（Tauri 序列化差异）
      let controlStr: string;
      if (typeof event.payload === 'string') {
        controlStr = event.payload;
      } else {
        controlStr = JSON.stringify(event.payload);
      }
      handlers.onMediaControl(JSON.parse(controlStr));
    } catch (error) {
      console.error('处理媒体控制失败:', error);
    }
  });

  const unlistenAccept = await listen<string>('video_call_accept', (event) => {
    handlers.onVideoCallAccept(event.payload);
  });

  const unlistenReject = await listen<string>('video_call_reject', (event) => {
    handlers.onVideoCallReject(event.payload);
  });

  const unlistenEnd = await listen<string>('video_call_end', (event) => {
    handlers.onVideoCallEnd(event.payload);
  });

  const unlistenMediaInfo = await listen<string>('media_info', (event) => {
    try {
      handlers.onMediaInfo(JSON.parse(event.payload));
    } catch (error) {
      console.error('处理媒体信息失败:', error);
    }
  });

  const unlistenMediaReady = await listen<string>(
    'media_receiver_ready',
    (event) => {
      handlers.onMediaReady(event.payload);
    },
  );

  return [
    unlistenVideo,
    unlistenAudio,
    unlistenControl,
    unlistenAccept,
    unlistenReject,
    unlistenEnd,
    unlistenMediaInfo,
    unlistenMediaReady,
  ];
}
