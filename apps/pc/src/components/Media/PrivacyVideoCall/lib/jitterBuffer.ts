/**
 * 自适应抖动缓冲（Jitter Buffer）
 *
 * 平滑网络抖动：视频帧到达不均匀时（网络抖动导致帧聚集到达），
 * 直接送解码器会因处理不过来而丢帧。抖动缓冲按目标延迟缓存帧，
 * 周期批量取出解码，避免解码器过载。
 *
 * 纯逻辑模块，不依赖 React。
 */
import { handleWebCodecsVideoFrame } from '../codec/videoDecoder';
import { FRAME_FLAG_CONFIG, parseFrameHeader } from '../protocol/frame';
import { MediaSession } from './mediaSession';

/** 缓冲上限（帧数）：超过后丢最旧帧，防止内存膨胀与延迟累积 */
const MAX_BUFFER_SIZE = 8;
/** 目标缓冲延迟（毫秒）：首帧开始等待该时长后才进入解码节奏 */
const TARGET_LATENCY_MS = 200;
/** 周期处理间隔（毫秒） */
const PROCESS_INTERVAL_MS = 30;

interface JitteredFrame {
  data: Uint8Array;
  queuedAt: number;
}

export class JitterBuffer {
  private buffer: JitteredFrame[] = [];
  private processTimer: number | null = null;
  private session: MediaSession;
  private friendId: string;

  constructor(session: MediaSession, friendId: string) {
    this.session = session;
    this.friendId = friendId;
  }

  /** 入队一帧，随后调度周期处理 */
  push(frame: Uint8Array) {
    // 解码器配置帧必须立即处理（对端靠它初始化解码器），不经过抖动缓冲
    const header = parseFrameHeader(frame);
    if (header && (header.flags & FRAME_FLAG_CONFIG) !== 0) {
      handleWebCodecsVideoFrame(this.session, this.friendId, frame);
      return;
    }

    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.buffer.shift(); // 丢最旧帧，保持低延迟
    }
    this.buffer.push({ data: frame, queuedAt: performance.now() });
    this.scheduleProcess();
  }

  private scheduleProcess() {
    if (this.processTimer !== null) return;
    this.processTimer = window.setTimeout(() => {
      this.processTimer = null;
      this.process();
    }, PROCESS_INTERVAL_MS);
  }

  /** 周期取帧：首批帧等待达到目标延迟后开始解码，后续每周期解一帧 */
  private process() {
    if (this.buffer.length === 0) return;

    const now = performance.now();
    const oldest = this.buffer[0];
    const waited = now - oldest.queuedAt;

    if (waited >= TARGET_LATENCY_MS) {
      const frame = this.buffer.shift();
      if (frame) {
        handleWebCodecsVideoFrame(this.session, this.friendId, frame.data);
      }
    }

    // 若仍有余帧，继续调度（避免帧在缓冲中堆积）
    if (this.buffer.length > 0) {
      this.scheduleProcess();
    }
  }

  /** 清空缓冲并停止调度（通话结束时调用） */
  destroy() {
    if (this.processTimer !== null) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
    this.buffer = [];
  }
}