import {
  CaretRightOutlined,
  LoadingOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import { convertPathToTauriUrl, getChatFileByBizId } from '@workspace/services';
import { message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/ChatVoice.less';

interface ChatVoiceProps {
  /** 服务器记录 biz_id（发送中的本地临时消息为空） */
  bizId?: string;
  /** 录音时长（秒） */
  duration: number;
  nanoId?: string;
  /** 发送中的本地绝对路径（乐观气泡，可即时播放） */
  localPath?: string;
  /** 是否上传中(展示上传进度) */
  sending?: boolean;
  uploadProgress?: number;
  sendPhase?: string;
}

const WAVE_BARS = 5;

/** 秒数格式化为语音时长：>=60s 用 m'ss" */
const formatVoiceDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds || 0));
  return s >= 60 ? `${Math.floor(s / 60)}'${s % 60}"` : `${s}"`;
};

/** 语音消息气泡：播放/暂停 + 播放倒计时，按需下载后本地播放 */
const ChatVoice: React.FC<ChatVoiceProps> = ({
  bizId,
  duration,
  nanoId,
  localPath,
  sending = false,
  uploadProgress = 0,
  sendPhase,
}) => {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  /** 当前播放进度（秒） */
  const [currentTime, setCurrentTime] = useState(0);
  /** 音频真实时长（秒；metadata 加载后可用，0 表示未知） */
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcRef = useRef<string | null>(null);

  const width = Math.min(200, Math.max(80, 80 + (duration || 0) * 4));
  /** 总时长：优先用音频真实时长，回退消息里的录音时长 */
  const totalSeconds =
    audioDuration > 0 ? Math.round(audioDuration) : duration || 0;
  /** 播放倒计时（剩余秒数） */
  const remainingSeconds = Math.max(
    0,
    Math.ceil(totalSeconds - currentTime),
  );
  /** 播放中/暂停在中途时展示剩余秒数，否则展示总时长 */
  const showRemaining = playing || currentTime > 0;
  const durationText = formatVoiceDuration(
    showRemaining ? remainingSeconds : totalSeconds,
  );

  const uploadPercent = Math.max(0, Math.min(100, Math.round(uploadProgress)));
  const uploadIndeterminate = sending && sendPhase !== 'uploading';

  const ensureSrc = async (): Promise<string | null> => {
    if (srcRef.current) return srcRef.current;
    if (localPath) {
      srcRef.current = convertPathToTauriUrl(localPath);
      return srcRef.current;
    }
    if (!bizId) return null;
    const files = await getChatFileByBizId(bizId, nanoId);
    const url = files?.[0]?.tauri_file_path || null;
    if (url) srcRef.current = url;
    return url;
  };

  const bindAudio = (url: string) => {
    const el = audioRef.current ?? new Audio();
    el.preload = 'auto';
    // 新音源：重置进度与已知时长
    setCurrentTime(0);
    setAudioDuration(0);
    el.onloadedmetadata = () => {
      setAudioDuration(
        Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0,
      );
    };
    el.ontimeupdate = () => setCurrentTime(el.currentTime || 0);
    el.onended = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    el.onerror = () => {
      setPlaying(false);
      setCurrentTime(0);
      message.error('语音播放失败');
    };
    el.src = url;
    audioRef.current = el;
  };

  const toggle = async () => {
    if (sending || loading) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      const url = await ensureSrc();
      if (!url) {
        message.error('语音播放失败');
        return;
      }
      if (!audioRef.current || audioRef.current.src !== url) bindAudio(url);
      await audioRef.current?.play();
      setPlaying(true);
    } catch (e) {
      console.error('播放语音失败:', e);
      message.error('语音播放失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <div
      className={styles.container}
      style={{ width }}
      onClick={toggle}
      role="button"
      tabIndex={0}
    >
      <span className={styles.playBtn}>
        {loading ? (
          <LoadingOutlined />
        ) : playing ? (
          <PauseOutlined />
        ) : (
          <CaretRightOutlined />
        )}
      </span>
      <span className={styles.wave}>
        {Array.from({ length: WAVE_BARS }).map((_, i) => (
          <i key={i} className={styles.waveBar} />
        ))}
      </span>
      <span className={styles.duration}>{durationText}</span>
      {sending && (
        <span className={styles.uploadBar}>
          <span
            className={
              uploadIndeterminate
                ? styles.uploadIndeterminate
                : styles.uploadProgress
            }
            style={uploadIndeterminate ? undefined : { width: `${uploadPercent}%` }}
          />
        </span>
      )}
    </div>
  );
};

export default React.memo(ChatVoice);
