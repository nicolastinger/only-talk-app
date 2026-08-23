import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import React, { useMemo, useState } from 'react';
import styles from './styles/WebRTCMessage.less';

interface WebRTCMessageProps {
  textType: number;
  isMine: boolean;
  /** 存储格式的 WebRTC 信令记录 JSON（{prev_id, type, sender, receiver, sessionId, data, timestamp}） */
  raw?: string;
}

/** 存储的信令记录结构 */
interface ParsedSignal {
  type: string;
  sender: string;
  receiver: string;
  sessionId?: string;
  data: any;
  timestamp: number;
}

// 视频通话控制消息类型（12-15）
const IS_CONTROL_TYPE = (textType: number): boolean =>
  textType >= 12 && textType <= 15;

// 控制消息 -> 图标 / 文案 key / 样式
interface ControlStep {
  icon: React.ReactNode;
  labelKey: string;
  styleType: string;
}

const getControlStep = (type: string): ControlStep => {
  switch (type) {
    case 'invite':
      return { icon: <VideoCameraOutlined />, labelKey: '', styleType: 'invite' };
    case 'accept':
      return { icon: <CheckCircleOutlined />, labelKey: 'webRTCMessage.accepted', styleType: 'accept' };
    case 'reject':
      return { icon: <CloseCircleOutlined />, labelKey: 'webRTCMessage.rejected', styleType: 'reject' };
    case 'end':
      return { icon: <PhoneOutlined />, labelKey: 'webRTCMessage.ended', styleType: 'end' };
    default:
      return { icon: <VideoCameraOutlined />, labelKey: 'webRTCMessage.signal', styleType: 'signal' };
  }
};

/** 从后端拉取的会话明细记录 */
interface DetailRecord {
  id: number;
  nano_id: string;
  session_id: string;
  msg_type: string;
  send_user: string;
  recv_user: string;
  data: string;
  timestamp: number;
}

/** 解析 ICE candidate 字符串: candidate:<foundation> <component> <protocol> <priority> <ip> <port> typ <type> ... */
const parseIceCandidate = (candidateStr: string) => {
  const parts = candidateStr.trim().split(/\s+/);
  if (parts.length >= 8 && parts[0].startsWith('candidate:')) {
    return { protocol: parts[2], ip: parts[4], port: parts[5], type: parts[7] };
  }
  return null;
};

/** 从 SDP 中提取 m= 行的媒体类型（audio/video/application...） */
const getSdpMediaTypes = (sdp: string): string[] => {
  const types: string[] = [];
  const regex = /^m=(\w+)\s/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sdp)) !== null) {
    types.push(match[1]);
  }
  return types;
};

const MEDIA_TYPE_MAP: Record<string, string> = {
  audio: 'webRTCMessage.mediaAudio',
  video: 'webRTCMessage.mediaVideo',
  application: 'webRTCMessage.mediaData',
  data: 'webRTCMessage.mediaData',
};

// 交换步骤 -> 图标/文案/样式
const getSignalStep = (type: string) => {
  switch (type) {
    case 'offer':
      return { icon: <VideoCameraOutlined />, labelKey: 'webRTCMessage.offer', styleType: 'invite' };
    case 'answer':
      return { icon: <CheckCircleOutlined />, labelKey: 'webRTCMessage.answer', styleType: 'accept' };
    case 'candidate':
      return { icon: <PhoneOutlined />, labelKey: 'webRTCMessage.candidate', styleType: 'signal' };
    case 'end':
      return { icon: <PhoneOutlined />, labelKey: 'webRTCMessage.ended', styleType: 'end' };
    default:
      return { icon: <VideoCameraOutlined />, labelKey: 'webRTCMessage.signal', styleType: 'signal' };
  }
};

/** 从会话明细记录提取可读摘要文案 */
const getDetailContent = (record: DetailRecord, t: (id: string) => string): string => {
  let data: any = record.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      // 保持原字符串
    }
  }

  if (record.msg_type === 'candidate') {
    const candidateStr = typeof data === 'string' ? data : data?.candidate;
    if (!candidateStr) return t('webRTCMessage.iceComplete');
    const parsed = parseIceCandidate(candidateStr);
    return parsed ? `${parsed.type} ${parsed.protocol} ${parsed.ip}:${parsed.port}` : candidateStr;
  }
  if (record.msg_type === 'offer' || record.msg_type === 'answer') {
    const sdp = typeof data === 'string' ? data : data?.sdp;
    if (sdp) {
      const mediaTypes = getSdpMediaTypes(sdp);
      if (mediaTypes.length > 0) {
        return mediaTypes
          .map((m) => {
            const mediaKey = MEDIA_TYPE_MAP[m];
            return mediaKey ? t(mediaKey) : m;
          })
          .join('+');
      }
    }
  }
  return '—';
};

const WebRTCMessage: React.FC<WebRTCMessageProps> = ({ textType, isMine, raw }) => {
  const intl = useIntl();
  const [showDetail, setShowDetail] = useState(false);
  const [detailRecords, setDetailRecords] = useState<DetailRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const t = (id: string) => intl.formatMessage({ id });

  // 解析存储的信令记录
  const signal = useMemo<ParsedSignal | null>(() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.type === 'string' ? (parsed as ParsedSignal) : null;
    } catch {
      return null;
    }
  }, [raw]);

  const fetchDetail = async () => {
    if (!signal?.sessionId) {
      setDetailRecords([]);
      return;
    }
    setDetailLoading(true);
    try {
      const records = await invoke<DetailRecord[]>('get_webrtc_signal_records', {
        sessionId: signal.sessionId,
      });
      setDetailRecords(records || []);
    } catch (e) {
      console.error('[WebRTCMessage] 获取WebRTC信令详情失败:', e);
      setDetailRecords([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleDetail = () => {
    const next = !showDetail;
    setShowDetail(next);
    if (next && !detailRecords.length) {
      fetchDetail();
    }
  };

  // 视频通话控制消息(12-15)：解析 raw 并渲染为状态气泡
  if (IS_CONTROL_TYPE(textType)) {
    const step = getControlStep(signal?.type || '');
    const isInvite = step.styleType === 'invite';
    const labelKey = isInvite
      ? isMine
        ? 'webRTCMessage.started'
        : 'webRTCMessage.otherStarted'
      : step.labelKey;
    const sessionText = signal?.sessionId
      ? `${t('webRTCMessage.session')}: ${signal.sessionId.slice(0, 8)}`
      : '';
    return (
      <div
        className={`${styles.container} ${styles[step.styleType]} ${
          isMine ? styles.mine : styles.friend
        }`}
      >
        <div className={styles.iconWrapper}>{step.icon}</div>
        <div className={styles.text}>
          <div className={styles.title}>
            {labelKey ? t(labelKey) : t('webRTCMessage.default')}
          </div>
          {sessionText && <div className={styles.content}>{sessionText}</div>}
        </div>
      </div>
    );
  }

  // 仅渲染 WebRTC 会话摘要（text_type=100），其余类型不再渲染
  if (textType !== 100 || !signal) {
    return null;
  }

  const step = getSignalStep(signal.type);
  const { type, data, sessionId } = signal;
  let contentText = '';
  let isIceComplete = false;

  if (type === 'candidate') {
    const candidateStr = typeof data === 'string' ? data : data?.candidate;
    if (!candidateStr) {
      isIceComplete = true;
    } else {
      const parsed = parseIceCandidate(candidateStr);
      contentText = parsed
        ? `${parsed.type} ${parsed.protocol} ${parsed.ip}:${parsed.port}`
        : candidateStr.length > 60
          ? `${candidateStr.slice(0, 60)}…`
          : candidateStr;
    }
  } else if (type === 'offer' || type === 'answer') {
    const sdp = typeof data === 'string' ? data : data?.sdp;
    if (sdp) {
      const mediaTypes = getSdpMediaTypes(sdp);
      if (mediaTypes.length > 0) {
        contentText = mediaTypes
          .map((m) => {
            const mediaKey = MEDIA_TYPE_MAP[m];
            return mediaKey ? t(mediaKey) : m;
          })
          .join('+');
      }
    }
  }

  const sessionText = sessionId ? `${t('webRTCMessage.session')}: ${sessionId.slice(0, 8)}` : '';

  return (
    <div
      className={`${styles.container} ${styles[step.styleType]} ${
        isMine ? styles.mine : styles.friend
      }`}
    >
      <div className={styles.iconWrapper}>{step.icon}</div>
      <div className={styles.text}>
        <div className={styles.title}>{t(step.labelKey)}</div>
        <div className={styles.content}>
          {isIceComplete ? t('webRTCMessage.iceComplete') : contentText || '—'}
          {sessionText && <span className={styles.session}>{sessionText}</span>}
        </div>
        {sessionId && (
          <div className={styles.detail} onClick={toggleDetail}>
            {showDetail ? t('webRTCMessage.hideDetail') : t('webRTCMessage.detail')}
          </div>
        )}
        {showDetail && (
          <div className={styles.detailContent}>
            {detailLoading && t('webRTCMessage.loading')}
            {!detailLoading && detailRecords.length === 0 && t('webRTCMessage.noDetail')}
            {!detailLoading &&
              detailRecords.map((record) => {
                const recStep = getSignalStep(record.msg_type);
                return (
                  <div key={`${record.id}_${record.msg_type}_${record.timestamp}`}>
                    <span className={styles.detailStep}>{t(recStep.labelKey)}</span>
                    <span className={styles.detailData}>
                      {getDetailContent(record, t)}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(WebRTCMessage);
