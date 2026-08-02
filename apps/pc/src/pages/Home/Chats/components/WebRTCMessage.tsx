import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
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

// 交换步骤 -> 图标/文案/样式（复用现有样式体系：offer=邀请色，answer=接听色，candidate=信令色）
const getSignalStep = (type: string) => {
  switch (type) {
    case 'offer':
      return { icon: <VideoCameraOutlined />, labelKey: 'webRTCMessage.offer', styleType: 'invite' };
    case 'answer':
      return { icon: <CheckCircleOutlined />, labelKey: 'webRTCMessage.answer', styleType: 'accept' };
    case 'candidate':
      return { icon: <PhoneOutlined />, labelKey: 'webRTCMessage.candidate', styleType: 'signal' };
    default:
      return { icon: <VideoCameraOutlined />, labelKey: 'webRTCMessage.signal', styleType: 'signal' };
  }
};

// 旧格式消息（视频通话状态消息）展示
const getMessageInfo = (textType: number, isMine: boolean, t: (id: string) => string) => {
  switch (textType) {
    case 5:
      return {
        icon: <VideoCameraOutlined />,
        text: isMine ? t('webRTCMessage.started') : t('webRTCMessage.otherStarted'),
        type: 'video-call',
      };
    case 12:
      return {
        icon: <VideoCameraOutlined />,
        text: isMine ? t('webRTCMessage.inviteSent') : t('webRTCMessage.inviteReceived'),
        type: 'invite',
      };
    case 13:
      return {
        icon: <CheckCircleOutlined />,
        text: t('webRTCMessage.accepted'),
        type: 'accept',
      };
    case 14:
      return {
        icon: <CloseCircleOutlined />,
        text: t('webRTCMessage.rejected'),
        type: 'reject',
      };
    case 15:
      return {
        icon: <PhoneOutlined />,
        text: t('webRTCMessage.ended'),
        type: 'end',
      };
    case 100:
      return {
        icon: <VideoCameraOutlined />,
        text: t('webRTCMessage.signal'),
        type: 'signal',
      };
    default:
      return {
        icon: <VideoCameraOutlined />,
        text: t('webRTCMessage.default'),
        type: 'default',
      };
  }
};

const WebRTCMessage: React.FC<WebRTCMessageProps> = ({ textType, isMine, raw }) => {
  const intl = useIntl();
  const [showDetail, setShowDetail] = useState(false);
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

  // 可解析出信令记录时：展示交换步骤与内容
  if (signal && textType === 100) {
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
          <div className={styles.detail} onClick={() => setShowDetail(!showDetail)}>
            {t('webRTCMessage.detail')}
          </div>
          {showDetail && (
            <pre className={styles.detailContent}>{JSON.stringify(signal, null, 2)}</pre>
          )}
        </div>
      </div>
    );
  }

  // 旧格式回退：视频通话状态消息
  const messageInfo = getMessageInfo(textType, isMine, t);

  return (
    <div
      className={`${styles.container} ${styles[messageInfo.type]} ${
        isMine ? styles.mine : styles.friend
      }`}
    >
      <div className={styles.iconWrapper}>{messageInfo.icon}</div>
      <div className={styles.text}>{messageInfo.text}</div>
    </div>
  );
};

export default React.memo(WebRTCMessage);
