/**
 * 音频解码（WebCodecs AudioDecoder + AudioContext 播放 / MediaSource 回退）。
 * 纯逻辑模块：以 `(session, audioEl, ...)` 方式操作，不依赖 React。
 */
import {
  defaultMediaConfig,
  dlog,
  FRAME_HEADER_SIZE,
  IS_WEBCODECS_SUPPORTED,
} from '../lib/config';
import { MediaSession } from '../lib/mediaSession';
import { FRAME_FLAG_CONFIG, parseFrameHeader } from '../protocol/frame';

/** 播放解码后的音频数据（AudioContext + AudioBufferSourceNode 实时播放） */
export function playDecodedAudio(session: MediaSession, audioData: AudioData) {
  const ctx = session.audioContext;
  if (!ctx) {
    console.warn('[PrivacyVideoCall] AudioContext 未初始化，丢弃音频');
    audioData.close();
    return;
  }

  // 恢复挂起状态（浏览器自动播放策略）
  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .catch((e) =>
        console.error('[PrivacyVideoCall] 恢复 AudioContext 失败:', e),
      );
  }

  try {
    const numberOfChannels = audioData.numberOfChannels;
    const frames = audioData.numberOfFrames;
    const buffer = ctx.createBuffer(numberOfChannels, frames, ctx.sampleRate);

    // 逐声道拷贝：先分配该平面所需字节，再 copyTo 到 Float32Array
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const planeSize = audioData.allocationSize({
        planeIndex: ch,
        format: 'f32-planar',
        frameOffset: 0,
        frameCount: frames,
      });
      const plane = new Float32Array(planeSize / 4);
      audioData.copyTo(plane, {
        planeIndex: ch,
        format: 'f32-planar',
        frameOffset: 0,
        frameCount: frames,
      });
      buffer.copyToChannel(plane, ch);
    }
    audioData.close();

    // 用 AudioBufferSourceNode 排程播放，按到达时间错开避免重叠
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    // 首个音频帧从当前时间+小抖动开始，后续帧排在前一帧结束之后
    let startTime = session.audioPlayTime;
    if (startTime === 0) {
      startTime = now + 0.05;
    }
    if (startTime < now) {
      startTime = now;
    }
    source.start(startTime);
    // 更新播放时钟：该 buffer 播放时长（秒）
    session.audioPlayTime = startTime + frames / ctx.sampleRate;
  } catch (error) {
    console.error('[PrivacyVideoCall] 播放音频失败:', error);
    audioData.close();
  }
}

/** 配置远程音频解码器 */
export function configureAudioDecoder(
  session: MediaSession,
  config: AudioDecoderConfig,
) {
  try {
    if (session.audioDecoder) {
      session.audioDecoder.close();
      session.audioDecoder = null;
    }

    const decoderConfig: AudioDecoderConfig = {
      codec: config.codec,
      sampleRate: config.sampleRate,
      numberOfChannels: config.numberOfChannels,
    };
    if (config.description) {
      decoderConfig.description = config.description;
    }

    const decoder = new AudioDecoder({
      output: (audioData: AudioData) => {
        playDecodedAudio(session, audioData);
      },
      error: (err) => {
        console.error('[PrivacyVideoCall] 音频解码器错误:', err);
      },
    });

    decoder.configure(decoderConfig);
    session.audioDecoder = decoder;
    session.decodedAudioConfig = decoderConfig;
    session.audioPlayTime = 0;
    console.log(
      '[PrivacyVideoCall] 音频解码器已配置:',
      decoderConfig.codec,
      'sampleRate=',
      decoderConfig.sampleRate,
      'channels=',
      decoderConfig.numberOfChannels,
    );
  } catch (error) {
    console.error('[PrivacyVideoCall] 配置音频解码器失败:', error);
  }
}

/** 处理 WebCodecs 音频帧数据：解析帧头，配置帧→配置解码器；数据帧→解码 */
export function handleWebCodecsAudioFrame(
  session: MediaSession,
  payload: Uint8Array,
) {
  const header = parseFrameHeader(payload);
  if (!header) return;
  const { timestamp, duration, dataLen, flags } = header;

  // 音频解码器配置帧
  if ((flags & FRAME_FLAG_CONFIG) !== 0) {
    try {
      const json = new TextDecoder().decode(
        payload.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + dataLen),
      );
      const cfg = JSON.parse(json);
      const config: AudioDecoderConfig = {
        codec: cfg.codec,
        sampleRate: cfg.sampleRate,
        numberOfChannels: cfg.numberOfChannels,
      };
      if (Array.isArray(cfg.description) && cfg.description.length > 0) {
        config.description = Uint8Array.from(cfg.description);
      }
      configureAudioDecoder(session, config);
    } catch (error) {
      console.error('[PrivacyVideoCall] 解析音频解码器配置失败:', error);
    }
    return;
  }

  // 音频数据帧
  const decoder = session.audioDecoder;
  if (!decoder) {
    console.warn('[PrivacyVideoCall] 音频解码器未就绪，丢弃帧');
    return;
  }
  try {
    const t = session.throughput;
    t.receivedFrames++;
    t.receivedBytes += dataLen;
    if (Date.now() - t.lastReportAt > 5000) {
      dlog(
        `[接收] 音频帧 5s 内: ${t.receivedFrames} 帧, ${(
          t.receivedBytes /
          1024 /
          5
        ).toFixed(1)} KB/s`,
      );
      t.lastReportAt = Date.now();
      t.receivedFrames = 0;
      t.receivedBytes = 0;
    }
    const chunk = new EncodedAudioChunk({
      type: 'key',
      timestamp,
      duration,
      data: payload.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + dataLen),
    });
    decoder.decode(chunk);
  } catch (error) {
    console.error('[PrivacyVideoCall] 音频解码失败:', error);
  }
}

/** 处理音频 SourceBuffer 缓冲队列（MediaSource 回退路径） */
export function processAudioBufferQueue(session: MediaSession) {
  if (
    !session.audioSourceBuffer ||
    !session.audioMediaSource ||
    session.audioMediaSource.readyState !== 'open' ||
    session.isAudioSourceBufferUpdating ||
    session.audioBufferQueue.length === 0
  ) {
    return;
  }

  const data = session.audioBufferQueue.shift();
  if (data) {
    try {
      session.isAudioSourceBufferUpdating = true;
      const newBuffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(newBuffer).set(data);
      session.audioSourceBuffer.appendBuffer(newBuffer);
    } catch (error) {
      console.error('追加音频缓冲失败:', error);
      session.isAudioSourceBufferUpdating = false;
      processAudioBufferQueue(session);
    }
  }
}

/** 初始化远程音频接收端（AudioContext / MediaSource 二选一） */
export function initAudioReceiver(
  session: MediaSession,
  audioEl: HTMLAudioElement | null,
) {
  // 音频：WebCodecs 可用时用 AudioDecoder + AudioContext 实时播放，否则走 MediaSource
  if (IS_WEBCODECS_SUPPORTED) {
    session.audioWebCodecsActive = true;
    // 重置音频解码器
    if (session.audioDecoder) {
      session.audioDecoder.close();
      session.audioDecoder = null;
    }
    session.decodedAudioConfig = null;
    session.audioPlayTime = 0;

    // 创建/复用 AudioContext 用于音频输出
    if (!session.audioContext) {
      try {
        session.audioContext = new AudioContext({
          sampleRate: defaultMediaConfig.audio_config.sample_rate,
        });
      } catch (error) {
        console.error('[PrivacyVideoCall] 创建 AudioContext 失败:', error);
        session.audioContext = null;
      }
    }
    // 暂停音频播放时钟，等首个音频帧到达后再启动
    session.audioPlayTime = 0;
  } else {
    session.audioWebCodecsActive = false;
    if (session.audioMediaSource) {
      if (session.audioMediaSource.readyState === 'open') {
        session.audioMediaSource.endOfStream();
      }
      session.audioMediaSource = null;
    }
    session.audioSourceBuffer = null;
    session.audioBufferQueue = [];
    session.isAudioSourceBufferUpdating = false;

    // 创建 MediaSource 用于音频流
    const audioMediaSource = new MediaSource();
    session.audioMediaSource = audioMediaSource;

    // 将 MediaSource 绑定到远程音频元素
    if (audioEl) {
      audioEl.src = URL.createObjectURL(audioMediaSource);
    }

    // 监听 sourceopen 事件
    audioMediaSource.addEventListener('sourceopen', () => {
      try {
        // 创建音频 SourceBuffer
        const audioBuffer = audioMediaSource.addSourceBuffer(
          defaultMediaConfig.audio_config.encode,
        );
        session.audioSourceBuffer = audioBuffer;

        // 监听 updateend 事件，处理缓冲队列
        audioBuffer.addEventListener('updateend', () => {
          session.isAudioSourceBufferUpdating = false;
          processAudioBufferQueue(session);
        });

        // 监听 error 事件
        audioBuffer.addEventListener('error', (e) => {
          console.error('音频 SourceBuffer 错误:', e);
          session.isAudioSourceBufferUpdating = false;
        });
      } catch (error) {
        console.error('创建音频 SourceBuffer 失败:', error);
      }
    });
  }
}
