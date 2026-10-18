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

/** 语音消息气泡：播放/暂停 + 时长，按需下载后本地播放 */
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcRef = useRef<string | null>(null);

  const width = Math.min(200, Math.max(80, 80 + (duration || 0) * 4));
  const durationText =
    duration >= 60 ? `${Math.floor(duration / 60)}'${duration % 60}"` : `${duration || 0}"`;

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
    el.src = url;
    el.onended = () => setPlaying(false);
    el.onerror = () => {
      setPlaying(false);
      message.error('语音播放失败');
    };
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
