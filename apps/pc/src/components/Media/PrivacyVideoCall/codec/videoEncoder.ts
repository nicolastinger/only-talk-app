/**
 * 视频编码（WebCodecs H264/VP8 实时编码 + MediaRecorder 回退）。
 * 纯逻辑模块：以 `(session, friendId, stream)` 方式操作，不依赖 React。
 */
import {
  defaultMediaConfig,
  dlog,
  FRAME_HEADER_SIZE,
  KEYFRAME_INTERVAL_MS,
  toNumberArray,
} from '../lib/config';
import { MediaSession } from '../lib/mediaSession';
import {
  createFrame,
  FRAME_FLAG_CONFIG,
  FRAME_FLAG_KEY,
} from '../protocol/frame';
import { sendP2pVideoFrame } from '../transport/p2pTransport';

/** 发送视频解码器配置帧（标志位 bit1），供对端初始化 VideoDecoder */
export async function sendVideoDecoderConfig(
  session: MediaSession,
  friendId: string,
  config: VideoDecoderConfig,
) {
  try {
    const json = JSON.stringify({
      codec: config.codec,
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight,
      description: toNumberArray(config.description),
      hardwareAcceleration: config.hardwareAcceleration,
      optimizeForLatency: config.optimizeForLatency,
    });
    const jsonBytes = new TextEncoder().encode(json);
    const payload = createFrame(jsonBytes.length, { flags: FRAME_FLAG_CONFIG });
    payload.set(jsonBytes, FRAME_HEADER_SIZE);
    await sendP2pVideoFrame(friendId, payload);
    dlog(
      `发送视频解码器配置: codec=${config.codec} descBytes=${jsonBytes.length}`,
    );
  } catch (error) {
    console.error('发送视频解码器配置失败:', error);
    dlog('❌ 发送视频解码器配置失败');
  }
}

/** 发送单个编码帧（裸编码数据 + 24 字节时间戳帧头） */
async function sendEncodedVideoChunk(
  _session: MediaSession,
  friendId: string,
  chunk: EncodedVideoChunk,
) {
  try {
    const payload = createFrame(chunk.byteLength, {
      timestamp: chunk.timestamp,
      duration: chunk.duration ?? 0,
      flags: chunk.type === 'key' ? FRAME_FLAG_KEY : 0,
    });
    chunk.copyTo(payload.subarray(FRAME_HEADER_SIZE));
    await sendP2pVideoFrame(friendId, payload);
  } catch (error) {
    console.error('发送WebCodecs视频帧失败:', error);
  }
}

/** 挑选可用的视频编码：优先 H264（硬件加速）→ VP8（软编兜底） */
export async function pickVideoCodec(): Promise<string> {
  const width = defaultMediaConfig.video_config.width;
  const height = defaultMediaConfig.video_config.height;
  const bitrate = defaultMediaConfig.video_config.bitrate;
  const framerate = defaultMediaConfig.video_config.fps;
  const accelerations: HardwareAcceleration[] = [
    'prefer-hardware',
    'no-preference',
  ];
  for (const codec of ['avc1.42E01E', 'avc1.640028', 'vp8']) {
    for (const hardwareAcceleration of accelerations) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate,
          framerate,
          hardwareAcceleration,
          latencyMode: 'realtime',
        });
        if (support.supported) {
          console.log(
            `[PrivacyVideoCall] 选择视频编码: ${codec} (${hardwareAcceleration})`,
          );
          return codec;
        }
      } catch (error) {
        console.warn(`[PrivacyVideoCall] 检测编码 ${codec} 失败:`, error);
      }
    }
  }
  console.warn('[PrivacyVideoCall] 未找到可用视频编码，默认使用 vp8');
  return 'vp8';
}

/** 使用 WebCodecs 实时编码视频帧（裸编码流，无容器） */
export async function startVideoWebCodecs(
  session: MediaSession,
  friendId: string,
  stream: MediaStream,
) {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;
  try {
    const codec = await pickVideoCodec();
    const width = defaultMediaConfig.video_config.width;
    const height = defaultMediaConfig.video_config.height;
    const encoderConfig: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: defaultMediaConfig.video_config.bitrate,
      framerate: defaultMediaConfig.video_config.fps,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'realtime',
    };
    const support = await VideoEncoder.isConfigSupported(encoderConfig);
    if (!support.supported) {
      encoderConfig.hardwareAcceleration = 'no-preference';
      const fallback = await VideoEncoder.isConfigSupported(encoderConfig);
      if (!fallback.supported) {
        throw new Error(`视频编码器配置不支持: ${codec}`);
      }
    }

    const encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        const t = session.throughput;
        t.sentFrames++;
        t.sentBytes += chunk.byteLength;
        // 每 5 秒打印一次发送吞吐
        if (Date.now() - t.lastReportAt > 5000) {
          dlog(
            `[发送] 视频帧 5s 内: ${t.sentFrames} 帧, ${(
              t.sentBytes /
              1024 /
              5
            ).toFixed(1)} KB/s, 最近帧 ${chunk.byteLength}B type=${chunk.type}`,
          );
          t.lastReportAt = Date.now();
          t.sentFrames = 0;
          t.sentBytes = 0;
        }
        // 每个关键帧都携带解码器配置（H264 的 SPS/PPS 在此），
        // 保证对端可随时重新初始化解码器并恢复解码。
        // 先发配置帧（await）再发关键帧数据，确保接收端先配置好解码器，避免首帧丢失。
        if (chunk.type === 'key' && metadata?.decoderConfig) {
          sendVideoDecoderConfig(session, friendId, metadata.decoderConfig)
            .then(() => sendEncodedVideoChunk(session, friendId, chunk))
            .catch((e) => {
              console.error('[PrivacyVideoCall] 发送关键帧失败:', e);
              sendEncodedVideoChunk(session, friendId, chunk);
            });
          session.lastSentVideoConfig = metadata.decoderConfig;
        } else {
          sendEncodedVideoChunk(session, friendId, chunk);
        }
      },
      error: (err) => {
        console.error('[PrivacyVideoCall] 视频编码器错误:', err);
      },
    });
    encoder.configure(encoderConfig);
    session.videoEncoder = encoder;
    dlog(
      `视频编码器启动: codec=${codec} ${width}x${height}@${encoderConfig.framerate} bps=${encoderConfig.bitrate} accel=${encoderConfig.hardwareAcceleration} 模式=WebCodecs`,
    );

    // 首个帧强制为关键帧，并带上解码器配置，保证对端能立即开始解码
    session.requestKeyframe = true;

    const processor = new MediaStreamTrackProcessor({ track: videoTrack });
    session.videoTrackProcessor = processor;
    const reader = processor.readable.getReader();
    session.videoReader = reader;

    const pump = async () => {
      try {
        while (session.videoEncoder) {
          const { value, done } = await reader.read();
          if (done) break;
          const frame = value as VideoFrame;
          // 编码背压控制：积压超过 2 帧时丢弃当前帧，避免延迟累积
          const encoderNow = session.videoEncoder;
          if (encoderNow && encoderNow.encodeQueueSize > 2) {
            frame.close();
            continue;
          }
          encoderNow?.encode(frame, {
            keyFrame: session.requestKeyframe,
          });
          session.requestKeyframe = false;
          frame.close();
        }
      } catch (err) {
        // reader.cancel() 会导致挂起的 read() 以 AbortError 结束，属正常停止流程
        if (err instanceof DOMException && err.name === 'AbortError') {
          dlog('视频轨道读取已正常停止');
        } else {
          console.error('[PrivacyVideoCall] 视频帧读取失败:', err);
        }
      } finally {
        session.videoReader = null;
        try {
          reader.releaseLock();
        } catch (e) {
          // 忽略释放锁失败
        }
      }
    };
    pump();

    // 周期关键帧，便于对端解码器断流后恢复
    if (session.keyframeTimer) clearInterval(session.keyframeTimer);
    session.keyframeTimer = setInterval(() => {
      session.requestKeyframe = true;
    }, KEYFRAME_INTERVAL_MS);
  } catch (error) {
    console.error(
      '[PrivacyVideoCall] WebCodecs 视频编码启动失败，视频将不可用（音频不受影响）:',
      error,
    );
    dlog('❌ 视频编码启动失败，原因见上方错误');
    // 注意：不能在此回退到 MediaRecorder —— 对端已按 WebCodecs 模式初始化，
    // 切换容器格式会导致画面无法解码。保持音频通道不受影响。
  }
}

/** 使用 MediaRecorder 录制视频（WebCodecs 不可用时的回退方案） */
export function startVideoRecorder(
  session: MediaSession,
  friendId: string,
  stream: MediaStream,
) {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;
  const videoStream = new MediaStream([videoTrack]);
  const videoRecorder = new MediaRecorder(videoStream, {
    mimeType: defaultMediaConfig.video_config.encode,
    videoBitsPerSecond: defaultMediaConfig.video_config.bitrate,
  });

  videoRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
      try {
        const buffer = await event.data.arrayBuffer();
        await sendP2pVideoFrame(friendId, new Uint8Array(buffer));
      } catch (error) {
        console.error('发送视频帧失败:', error);
      }
    }
  };

  videoRecorder.start(50);
  session.mediaRecorder = videoRecorder;
}
