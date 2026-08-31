/**
 * P2P 媒体事件监听：类型化注册 Tauri `listen(...)` 事件，
 * 屏蔽 IPC 事件名、payload 序列化差异，向调用方暴露结构化回调。
 *
 * 视频/音频帧不再走 `video_frame`/`audio_frame` 事件（JSON number 数组序列化），
 * 改由 `start_video_channel` 注册的 Channel 二进制直传（见 registerP2pMediaChannels）。
 */
import { Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MediaControl, MediaInfo } from '@workspace/types';
import { startVideoChannel } from '../transport/p2pTransport';

export interface P2pMediaEventHandlers {
  onMediaControl: (control: MediaControl) => void;
  onVideoCallAccept: (payload: string) => void;
  onVideoCallReject: (payload: string) => void;
  onVideoCallEnd: (payload: string) => void;
  onMediaInfo: (info: MediaInfo) => void;
  onMediaReady: (payload: string) => void;
}

/** 仅处理视频/音频帧回调解耦（供 Channel 注册使用） */
export interface P2pMediaFrameHandlers {
  onVideoFrame: (payload: Uint8Array) => void;
  onAudioFrame: (payload: Uint8Array) => void;
}

/**
 * 注册 P2P 媒体接收 Channel（视频/音频二进制直传）。
 * 创建两个 Channel 并通过 `start_video_channel` 注册到 Rust 端，
 * 之后 MediaData 通道收到的帧直接以二进制回调 onVideoFrame/onAudioFrame。
 * 返回取消函数数组（与事件监听一致的接口）。
 */
export async function registerP2pMediaChannels(
  friendId: string,
  handlers: P2pMediaFrameHandlers,
): Promise<Array<() => void>> {
  const videoChannel = new Channel<Uint8Array>();
  videoChannel.onmessage = (frameData) => {
    if (frameData && (frameData as unknown as ArrayBuffer).byteLength > 0) {
      // Channel 二进制消息到达时是 ArrayBuffer（Raw body），统一转成 Uint8Array 视图
      handlers.onVideoFrame(new Uint8Array(frameData as unknown as ArrayBuffer));
    }
  };

  const audioChannel = new Channel<Uint8Array>();
  audioChannel.onmessage = (frameData) => {
    if (frameData && (frameData as unknown as ArrayBuffer).byteLength > 0) {
      handlers.onAudioFrame(new Uint8Array(frameData as unknown as ArrayBuffer));
    }
  };

  await startVideoChannel(friendId, videoChannel, audioChannel);

  // Channel 无法通过公开 API 手动反注册，组件卸载时由窗口销毁自动清理。
  // 返回空取消函数以保持与事件监听一致的接口约定。
  return [() => {}];
}

/** 注册全部 P2P 媒体事件（不含视频/音频帧，帧由 Channel 传输），返回取消监听函数数组 */
export async function registerP2pMediaEvents(
  handlers: P2pMediaEventHandlers,
): Promise<Array<() => void>> {

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
    unlistenControl,
    unlistenAccept,
    unlistenReject,
    unlistenEnd,
    unlistenMediaInfo,
    unlistenMediaReady,
  ];
}
