/**
 * 呼叫提示界面（来电/去电/被拒）
 *
 * 现代化布局：模糊头像背景 + 光晕头像 + 名称与状态文案 + 圆形操作按钮。
 * 语音通话（无视频）时同样复用该界面，仅文案与图标不同。
 */
import { DEFAULT_ICON } from '@/constants';
import {
  AudioOutlined,
  CloseOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import React from 'react';
import styles from '../index.less';

export type CallStage =
  | 'incoming'
  | 'outgoing'
  | 'connecting'
  | 'connected'
  | 'rejected'
  | 'ended';

interface CallScreenProps {
  callStage: CallStage;
  friendName?: string;
  friendAvatar?: string;
  isVideoCall: boolean;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
}

const CallScreen: React.FC<CallScreenProps> = ({
  callStage,
  friendName,
  friendAvatar,
  isVideoCall,
  onAccept,
  onReject,
  onCancel,
}) => {
  const intl = useIntl();

  const avatar = friendAvatar || DEFAULT_ICON;
  const mediaLabel = intl.formatMessage({
    id: isVideoCall ? 'chat.tools.video' : 'chat.tools.audio',
  });
  const mediaIcon = isVideoCall ? <VideoCameraOutlined /> : <AudioOutlined />;

  let stageText = '';
  if (callStage === 'incoming') {
    stageText = intl.formatMessage({
      id: isVideoCall ? 'call.incomingVideo' : 'call.incomingAudio',
    });
  } else if (callStage === 'outgoing') {
    stageText = intl.formatMessage({ id: 'call.outgoing' });
  } else if (callStage === 'rejected') {
    stageText = intl.formatMessage({ id: 'webRTCMessage.rejected' });
  } else {
    stageText = intl.formatMessage({ id: 'call.ended' });
  }

  return (
    <div className={styles.callScreen}>
      {friendAvatar && (
        <div
          className={styles.callScreenBackdrop}
          style={{ backgroundImage: `url("${friendAvatar}")` }}
        />
      )}

      <div className={styles.callScreenContent}>
        <div className={styles.callAvatarHalo}>
          <span className={styles.callAvatarRing} />
          <span className={styles.callAvatarRingSlow} />
          <img className={styles.callAvatar} src={avatar} alt="" />
          <span className={styles.callAvatarMedia}>{mediaIcon}</span>
        </div>

        <div className={styles.callName}>{friendName || mediaLabel}</div>
        <div className={styles.callMediaLabel}>{mediaLabel}</div>
        <div className={styles.callStageText}>{stageText}</div>

        {callStage === 'incoming' ? (
          <div className={styles.callActions}>
            <div className={styles.callActionItem}>
              <button
                type="button"
                className={`${styles.callAction} ${styles.callActionReject}`}
                onClick={onReject}
              >
                <CloseOutlined />
              </button>
              <span className={styles.callActionLabel}>
                {intl.formatMessage({ id: 'call.decline' })}
              </span>
            </div>
            <div className={styles.callActionItem}>
              <button
                type="button"
                className={`${styles.callAction} ${styles.callActionAccept}`}
                onClick={onAccept}
              >
                <PhoneOutlined rotate={135} />
              </button>
              <span className={styles.callActionLabel}>
                {intl.formatMessage({ id: 'call.accept' })}
              </span>
            </div>
          </div>
        ) : callStage === 'outgoing' ? (
          <div className={styles.callActions}>
            <div className={styles.callActionItem}>
              <button
                type="button"
                className={`${styles.callAction} ${styles.callActionReject}`}
                onClick={onCancel}
              >
                <PhoneOutlined rotate={135} />
              </button>
              <span className={styles.callActionLabel}>
                {intl.formatMessage({ id: 'call.hangup' })}
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.callRingingDots}>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  );
};

export default CallScreen;
