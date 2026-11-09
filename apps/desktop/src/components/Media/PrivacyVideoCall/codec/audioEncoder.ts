/**
 * 音频编码（WebCodecs Opus 实时编码 + MediaRecorder 回退）。
 * 纯逻辑模块：以 `(session, friendId, stream)` 方式操作，不依赖 React。
 */
import {
  defaultMediaConfig,
  dlog,
  FRAME_HEADER_SIZE,
  toNumberArray,
} from '../lib/config';
import { MediaSession } from '../lib/mediaSession';
import { createFrame, FRAME_FLAG_CONFIG } from '../protocol/frame';
import { sendP2pAudioFrame } from '../transport/p2pTransport';

/** 发送音频解码器配置帧（标志位 bit1），供对端初始化 AudioDecoder */
export async function sendAudioDecoderConfig(
  session: MediaSession,
  friendId: string,
  config: AudioDecoderConfig,
) {
  try {
    const json = JSON.stringify({
      codec: config.codec,
      sampleRate: config.sampleRate,
      numberOfChannels: config.numberOfChannels,
      description: toNumberArray(config.description),
    });
    const jsonBytes = new TextEncoder().encode(json);
    const payload = createFrame(jsonBytes.length, { flags: FRAME_FLAG_CONFIG });
    payload.set(jsonBytes, FRAME_HEADER_SIZE);
    console.log(
      '[PrivacyVideoCall] 发送音频解码器配置:',
      config.codec,
      'sampleRate=',
      config.sampleRate,
      'channels=',
      config.numberOfChannels,
      'descBytes=',
      jsonBytes.length,
    );
    await sendP2pAudioFrame(friendId, payload);
  } catch (error) {
    console.error('发送音频解码器配置失败:', error);
  }
}

/** 发送单个音频编码帧（裸 Opus 数据 + 24 字节帧头） */
async function sendEncodedAudioChunk(
  _session: MediaSession,
  friendId: string,
  chunk: EncodedAudioChunk,
) {
  try {
    const payload = createFrame(chunk.byteLength, {
      timestamp: chunk.timestamp,
      duration: chunk.duration ?? 0,
    });
    chunk.copyTo(payload.subarray(FRAME_HEADER_SIZE));
    await sendP2pAudioFrame(friendId, payload);
  } catch (error) {
    console.error('发送WebCodecs音频帧失败:', error);
  }
}

/** 使用 WebCodecs 实时编码音频（Opus 裸帧，无 WebM 容器） */
export async function startAudioWebCodecs(
  session: MediaSession,
  friendId: string,
  stream: MediaStream,
) {
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) return;
  try {
    const sampleRate = defaultMediaConfig.audio_config.sample_rate;
    const channels = defaultMediaConfig.audio_config.channels;

    // Opus 解码器配置：需要描述 sample rate / channel layout
    const audioConfig: AudioEncoderConfig = {
      codec: 'opus',
      sampleRate,
      numberOfChannels: channels,
      bitrate: defaultMediaConfig.audio_config.bitrate,
    };
    const support = await AudioEncoder.isConfigSupported(audioConfig);
    if (!support.supported) {
      throw new Error('Opus 音频编码器配置不支持');
    }

    const encoder = new AudioEncoder({
      output: (chunk, metadata) => {
        const t = session.throughput;
        t.sentFrames++;
        t.sentBytes += chunk.byteLength;
        if (Date.now() - t.lastReportAt > 5000) {
          dlog(
            `[发送] 音频帧 5s 内: ${t.sentFrames} 帧, ${(
              t.sentBytes /
              1024 /
              5
            ).toFixed(1)} KB/s, 最近帧 ${chunk.byteLength}B`,
          );
          t.lastReportAt = Date.now();
          t.sentFrames = 0;
          t.sentBytes = 0;
        }
        // 首个 chunk 携带解码器配置，用于对端初始化 AudioDecoder
        if (metadata?.decoderConfig) {
          sendAudioDecoderConfig(session, friendId, metadata.decoderConfig);
          session.lastSentAudioConfig = metadata.decoderConfig;
        }
        sendEncodedAudioChunk(session, friendId, chunk);
      },
      error: (err) => {
        console.error('[PrivacyVideoCall] 音频编码器错误:', err);
      },
    });
    encoder.configure(audioConfig);
    session.audioEncoder = encoder;
    dlog(
      `音频编码器启动: codec=opus sampleRate=${sampleRate} channels=${channels} bps=${audioConfig.bitrate} 模式=WebCodecs`,
    );

    const processor = new MediaStreamTrackProcessor({ track: audioTrack });
    session.audioTrackProcessor =
      processor as unknown as AudioStreamTrackProcessorLike;
    const reader = processor.readable.getReader();
    session.audioReader =
      reader as unknown as ReadableStreamDefaultReader<AudioData>;

    const pump = async () => {
      try {
        while (session.audioEncoder) {
          const { value, done } = await reader.read();
          if (done) break;
          const data = value as unknown as AudioData;
          // 背压控制：积压过大时丢弃音频块，避免延迟累积
          const encoderNow = session.audioEncoder;
          if (encoderNow && encoderNow.encodeQueueSize > 10) {
            data.close();
            continue;
          }
          encoderNow?.encode(data);
          data.close();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          dlog('音频轨道读取已正常停止');
        } else {
          console.error('[PrivacyVideoCall] 音频帧读取失败:', err);
        }
      } finally {
        session.audioReader = null;
        try {
          reader.releaseLock();
        } catch (e) {
          // 忽略释放锁失败
        }
      }
    };
    pump();
  } catch (error) {
    console.error(
      '[PrivacyVideoCall] WebCodecs 音频编码启动失败，音频将不可用:',
      error,
    );
    // 对端已按 WebCodecs 模式初始化，不能回退 MediaRecorder（容器格式不匹配）
  }
}

/** 使用 MediaRecorder 录制音频（WebCodecs 不可用时的回退方案） */
export function startAudioRecorder(
  session: MediaSession,
  friendId: string,
  stream: MediaStream,
) {
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) return;
  const audioStream = new MediaStream([audioTrack]);
  const audioRecorder = new MediaRecorder(audioStream, {
    mimeType: defaultMediaConfig.audio_config.encode,
    audioBitsPerSecond: defaultMediaConfig.audio_config.bitrate,
  });

  audioRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
      try {
        const buffer = await event.data.arrayBuffer();
        await sendP2pAudioFrame(friendId, new Uint8Array(buffer));
      } catch (error) {
        console.error('发送音频帧失败:', error);
      }
    }
  };

  audioRecorder.start(20);
  session.audioRecorder = audioRecorder;
}
