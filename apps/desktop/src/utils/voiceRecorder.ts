import { invoke } from '@tauri-apps/api/core';

/**
 * 语音录音（PC / WebView2）。
 *
 * 与移动端 `apps/mobile/src/chat/useVoiceRecorder.ts` 同构：点击开始 / 点击停止，
 * 停止时把音频字节落到应用临时目录（Tauri 命令 `save_voice_temp_file`），
 * 得到 Rust 侧可读的绝对路径后走与附件相同的上传管道发送。
 * 容器优先 webm/opus（Chromium 内核稳定支持，服务端白名单含 webm）。
 */

export interface VoiceRecordingResult {
  /** 已落盘的本地绝对路径 */
  path: string;
  /** 录音时长（秒，向上取整且至少 1） */
  duration: number;
  /** 容器扩展名（webm/ogg/m4a…） */
  ext: string;
}

export const VOICE_MIN_DURATION = 1;
export const VOICE_MAX_DURATION = 60;

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
];

const pickMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
};

const extFromMime = (mime: string): string => {
  const m = mime.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'webm';
};

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private mimeType = '';

  get recording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  elapsedSeconds(): number {
    if (!this.startedAt) return 0;
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  async start(): Promise<void> {
    if (this.recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.stream = stream;

    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    this.mimeType = recorder.mimeType || mimeType || 'audio/webm';
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder = recorder;
    this.startedAt = Date.now();
    recorder.start(250);
  }

  async stop(): Promise<VoiceRecordingResult> {
    const recorder = this.mediaRecorder;
    if (!recorder) throw new Error('录音未开始');
    const duration = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const chunks = this.chunks;
    const mimeType = this.mimeType;

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;

    this.releaseStream();
    this.mediaRecorder = null;
    this.startedAt = 0;

    const blob = new Blob(chunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const ext = extFromMime(mimeType);
    const path = await invoke<string>('save_voice_temp_file', {
      bytes: Array.from(new Uint8Array(buffer)),
      ext,
    });
    return { path, duration, ext };
  }

  cancel(): void {
    const recorder = this.mediaRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    this.chunks = [];
    this.mediaRecorder = null;
    this.startedAt = 0;
    this.releaseStream();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
