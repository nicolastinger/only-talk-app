import {
  VOICE_MAX_DURATION,
  VOICE_MIN_DURATION,
  VoiceRecorder,
  type VoiceRecordingResult,
} from '@/utils/voiceRecorder';
import { useIntl } from '@umijs/max';
import { Modal, message } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './styles/VoiceRecordModal.less';

interface VoiceRecordModalProps {
  open: boolean;
  /** 关闭（取消录音） */
  onCancel: () => void;
  /** 录音完成待发送 */
  onSend: (result: VoiceRecordingResult) => void;
  maxDuration?: number;
}

const formatSeconds = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/** 语音录音弹窗：打开即开始录音，停止后落盘并回调发送 */
const VoiceRecordModal: React.FC<VoiceRecordModalProps> = ({
  open,
  onCancel,
  onSend,
  maxDuration = VOICE_MAX_DURATION,
}) => {
  const intl = useIntl();
  const recorder = useMemo(() => new VoiceRecorder(), []);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopAndSend = async () => {
    if (busy) return;
    setBusy(true);
    clearTimer();
    try {
      const result = await recorder.stop();
      if (result.duration < VOICE_MIN_DURATION) {
        message.warning(intl.formatMessage({ id: 'chat.voice.tooShort' }));
        onCancel();
        return;
      }
      onSend(result);
      onCancel();
    } catch (e) {
      console.error('录音落盘失败:', e);
      message.error(intl.formatMessage({ id: 'chat.voice.failed' }));
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      clearTimer();
      recorder.cancel();
      setElapsed(0);
      return;
    }

    let disposed = false;
    (async () => {
      try {
        await recorder.start();
      } catch (e) {
        console.error('开始录音失败:', e);
        message.error(intl.formatMessage({ id: 'chat.voice.startFailed' }));
        onCancel();
        return;
      }
      if (disposed) {
        recorder.cancel();
        return;
      }
      clearTimer();
      timerRef.current = setInterval(() => {
        const s = recorder.elapsedSeconds();
        setElapsed(s);
        if (s >= maxDuration) {
          void stopAndSend();
        }
      }, 200);
    })();

    return () => {
      disposed = true;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const progress = Math.min(100, Math.round((elapsed / maxDuration) * 100));

  return (
    <Modal
      open={open}
      title={intl.formatMessage({ id: 'chat.voice.recording' })}
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard={false}
      width={360}
      onCancel={onCancel}
    >
      <div className={styles.container}>
        <div className={styles.wave}>
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className={styles.waveBar}
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
        <div className={styles.timer}>{formatSeconds(elapsed)}</div>
        <div className={styles.progress}>
          <div className={styles.progressInner} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.hint}>
          {intl.formatMessage(
            { id: 'chat.voice.maxDuration' },
            { seconds: maxDuration },
          )}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={busy}
            onClick={() => {
              clearTimer();
              recorder.cancel();
              onCancel();
            }}
          >
            {intl.formatMessage({ id: 'chat.voice.cancel' })}
          </button>
          <button
            type="button"
            className={styles.stopBtn}
            disabled={busy}
            onClick={stopAndSend}
          >
            {intl.formatMessage({ id: 'chat.voice.tapToStop' })}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default VoiceRecordModal;
