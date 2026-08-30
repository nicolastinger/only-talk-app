/**
 * 视频解码（WebCodecs 解码到画布 + MediaSource 回退）。
 * 纯逻辑模块：以 `(session, videoEl, ...)` 方式操作，不依赖 React。
 */
import {
  defaultMediaConfig,
  dlog,
  FRAME_HEADER_SIZE,
  IS_WEBCODECS_SUPPORTED,
} from '../lib/config';
import { MediaSession } from '../lib/mediaSession';
import {
  FRAME_FLAG_CONFIG,
  FRAME_FLAG_KEY,
  parseFrameHeader,
} from '../protocol/frame';
import { sendVideoDecoderConfig } from './videoEncoder';

/** 刷新待解码的视频数据帧缓冲：解码器配置完成后，把暂存帧按序交给解码器 */
export function flushPendingVideoFrames(
  session: MediaSession,
  decoder: VideoDecoder,
) {
  const pending = session.pendingVideoFrames;
  session.pendingVideoFrames = [];
  if (pending.length > 0) {
    dlog(`刷新暂存视频帧 ${pending.length} 帧`);
    for (const chunk of pending) {
      try {
        decoder.decode(chunk);
      } catch (error) {
        console.error('[PrivacyVideoCall] 刷新暂存视频帧解码失败:', error);
      }
    }
  }
}

/** 配置远程视频解码器（使用对方通过配置帧传来的 codec、SPS/PPS） */
export function configureVideoDecoder(
  session: MediaSession,
  friendId: string,
  config: VideoDecoderConfig,
) {
  try {
    if (session.videoDecoder) {
      session.videoDecoder.close();
      session.videoDecoder = null;
    }

    const decoderConfig: VideoDecoderConfig = {
      codec: config.codec,
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight,
      optimizeForLatency: true,
    };
    if (config.description) {
      decoderConfig.description = config.description;
    }

    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        const canvas = session.videoCanvas;
        const ctx = session.videoCanvasCtx;
        if (canvas && ctx) {
          const w = frame.displayWidth || frame.codedWidth;
          const h = frame.displayHeight || frame.codedHeight;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        }
        frame.close();
      },
      error: (err) => {
        console.error('[PrivacyVideoCall] 视频解码器错误:', err);
        // 解码失败时请求关键帧以便尽快恢复
        session.requestKeyframe = true;
        // 请求对方重新发送解码器配置
        sendVideoDecoderConfig(
          session,
          friendId,
          session.decodedVideoConfig || config,
        );
      },
    });

    decoder.configure(decoderConfig);
    session.videoDecoder = decoder;
    session.decodedVideoConfig = decoderConfig;
    dlog(
      `视频解码器已配置: codec=${decoderConfig.codec} ${
        decoderConfig.codedWidth
      }x${decoderConfig.codedHeight} 描述字节=${
        decoderConfig.description?.byteLength ?? 0
      }`,
    );
    // 配置完成后刷新之前缓冲的视频帧
    flushPendingVideoFrames(session, decoder);
  } catch (error) {
    console.error('[PrivacyVideoCall] 配置视频解码器失败:', error);
    dlog('❌ 视频解码器配置失败，原因见上方错误');
  }
}

/** 处理 WebCodecs 视频帧数据：解析帧头，配置帧→配置解码器；数据帧→解码 */
export function handleWebCodecsVideoFrame(
  session: MediaSession,
  friendId: string,
  payload: Uint8Array,
) {
  const header = parseFrameHeader(payload);
  if (!header) return;
  const { timestamp, duration, dataLen, flags } = header;

  // 解码器配置帧
  if ((flags & FRAME_FLAG_CONFIG) !== 0) {
    try {
      const json = new TextDecoder().decode(
        payload.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + dataLen),
      );
      const cfg = JSON.parse(json);
      const config: VideoDecoderConfig = {
        codec: cfg.codec,
        codedWidth: cfg.codedWidth,
        codedHeight: cfg.codedHeight,
        optimizeForLatency: true,
      };
      if (Array.isArray(cfg.description) && cfg.description.length > 0) {
        config.description = Uint8Array.from(cfg.description);
      }
      configureVideoDecoder(session, friendId, config);
    } catch (error) {
      console.error('[PrivacyVideoCall] 解析视频解码器配置失败:', error);
    }
    return;
  }

  // 数据帧
  const decoder = session.videoDecoder;
  if (!decoder) {
    // 解码器尚未配置（首次通话配置帧可能晚于数据帧到达）。
    // 暂存数据帧，等配置帧到达后再按序刷新，避免首帧永久丢失。
    // 同时请求关键帧（关键帧会携带解码器配置），加速恢复。
    dlog(`视频解码器未就绪，缓冲数据帧(flags=${flags})并请求关键帧`);
    try {
      session.pendingVideoFrames.push(
        new EncodedVideoChunk({
          type: (flags & FRAME_FLAG_KEY) !== 0 ? 'key' : 'delta',
          timestamp,
          duration,
          data: payload.subarray(
            FRAME_HEADER_SIZE,
            FRAME_HEADER_SIZE + dataLen,
          ),
        }),
      );
      // 缓冲过多时丢弃最旧的，防止内存膨胀
      if (session.pendingVideoFrames.length > 90) {
        session.pendingVideoFrames.shift();
      }
      session.requestKeyframe = true;
    } catch (error) {
      console.error('[PrivacyVideoCall] 缓冲视频帧失败:', error);
    }
    return;
  }
  try {
    const t = session.throughput;
    t.receivedFrames++;
    t.receivedBytes += dataLen;
    if (Date.now() - t.lastReportAt > 5000) {
      dlog(
        `[接收] 视频帧 5s 内: ${t.receivedFrames} 帧, ${(
          t.receivedBytes /
          1024 /
          5
        ).toFixed(1)} KB/s, 关键帧占比 ${
          t.receivedFrames
            ? Math.round((t.receivedKeyFrames / t.receivedFrames) * 100)
            : 0
        }%`,
      );
      t.lastReportAt = Date.now();
      t.receivedFrames = 0;
      t.receivedBytes = 0;
      t.receivedKeyFrames = 0;
    }
    if ((flags & FRAME_FLAG_KEY) !== 0) {
      t.receivedKeyFrames++;
      session.videoFirstKeyframeReceived = true;
    }
    const chunk = new EncodedVideoChunk({
      type: (flags & FRAME_FLAG_KEY) !== 0 ? 'key' : 'delta',
      timestamp,
      duration,
      data: payload.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + dataLen),
    });
    // 解码器配置后尚未收到任何数据帧前，先刷新缓冲（按序解码）
    if (session.pendingVideoFrames.length > 0) {
      flushPendingVideoFrames(session, decoder);
    }
    decoder.decode(chunk);
  } catch (error) {
    console.error('[PrivacyVideoCall] 视频解码失败:', error);
  }
}

/** 处理视频 SourceBuffer 缓冲队列（MediaSource 回退路径） */
export function processVideoBufferQueue(session: MediaSession) {
  if (
    !session.sourceBuffer ||
    !session.mediaSource ||
    session.mediaSource.readyState !== 'open' ||
    session.isVideoSourceBufferUpdating ||
    session.videoBufferQueue.length === 0
  ) {
    return;
  }

  const data = session.videoBufferQueue.shift();
  if (data) {
    try {
      session.isVideoSourceBufferUpdating = true;
      const newBuffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(newBuffer).set(data);
      session.sourceBuffer.appendBuffer(newBuffer);
    } catch (error) {
      console.error('追加视频缓冲失败:', error);
      session.isVideoSourceBufferUpdating = false;
      processVideoBufferQueue(session);
    }
  }
}

/** 初始化远程视频接收端（WebCodecs 画布捕获流 / MediaSource 二选一） */
export function initVideoReceiver(
  session: MediaSession,
  videoEl: HTMLVideoElement | null,
) {
  if (IS_WEBCODECS_SUPPORTED) {
    // 视频：WebCodecs 解码到画布，再经 captureStream 输出到 video 元素
    if (session.videoCanvas) {
      session.videoCanvas.width = 0;
      session.videoCanvas.height = 0;
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = defaultMediaConfig.video_config.width;
      canvas.height = defaultMediaConfig.video_config.height;
      session.videoCanvas = canvas;
    }
    session.videoCanvasCtx = session.videoCanvas.getContext(
      '2d',
    ) as CanvasRenderingContext2D | null;

    // 重置/重建画布捕获流
    if (session.remoteCanvasStream) {
      session.remoteCanvasStream.getTracks().forEach((t) => t.stop());
      session.remoteCanvasStream = null;
    }
    if (videoEl) {
      const stream = session.videoCanvas.captureStream(
        defaultMediaConfig.video_config.fps,
      );
      session.remoteCanvasStream = stream;
      videoEl.srcObject = stream;
    }

    // 重置视频解码器
    if (session.videoDecoder) {
      session.videoDecoder.close();
      session.videoDecoder = null;
    }
    session.decodedVideoConfig = null;
    session.pendingVideoFrames = [];
    session.videoFirstKeyframeReceived = false;
  } else {
    if (session.mediaSource) {
      if (session.mediaSource.readyState === 'open') {
        session.mediaSource.endOfStream();
      }
      session.mediaSource = null;
    }
    session.sourceBuffer = null;
    session.videoBufferQueue = [];
    session.isVideoSourceBufferUpdating = false;

    const mediaSource = new MediaSource();
    session.mediaSource = mediaSource;

    // 将 MediaSource 绑定到远程视频元素
    if (videoEl) {
      videoEl.src = URL.createObjectURL(mediaSource);
    }

    // 监听 sourceopen 事件
    mediaSource.addEventListener('sourceopen', () => {
      try {
        // 创建视频 SourceBuffer
        const buffer = mediaSource.addSourceBuffer(
          defaultMediaConfig.video_config.encode,
        );
        session.sourceBuffer = buffer;

        // 监听 updateend 事件，处理缓冲队列
        buffer.addEventListener('updateend', () => {
          session.isVideoSourceBufferUpdating = false;
          processVideoBufferQueue(session);
        });

        // 监听 error 事件
        buffer.addEventListener('error', (e) => {
          console.error('视频 SourceBuffer 错误:', e);
          session.isVideoSourceBufferUpdating = false;
        });
      } catch (error) {
        console.error('创建视频 SourceBuffer 失败:', error);
      }
    });
  }
}
