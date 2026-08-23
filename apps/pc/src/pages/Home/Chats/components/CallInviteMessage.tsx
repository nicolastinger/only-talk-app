import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { openWebRTCChatHandler } from '@/hooks/useWebRTCSignalApi';
import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import { TextQuicMsgVo } from '@workspace/types';
import { Button, message } from 'antd';
import { nanoid } from 'nanoid';
import React, { useState } from 'react';
import styles from './styles/CallInviteMessage.less';

interface CallInviteMessageProps {
  friendUuid: string;
  raw?: string;
}

interface InviteRaw {
  type: string;
  sender: string;
  receiver: string;
  sessionId?: string;
  timestamp: number;
}

const CallInviteMessage: React.FC<CallInviteMessageProps> = ({ friendUuid, raw }) => {
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const userInfo = useBearStore((state) => state.userInfo);
  const meUuid = userInfo?.uuid || '';

  const parseInvite = (): InviteRaw | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.type === 'string' ? (parsed as InviteRaw) : null;
    } catch {
      return null;
    }
  };
  const invite = parseInvite();

  const sendControlMsg = async (text_type: number) => {
    const msg: TextQuicMsgVo = {
      nano_id: nanoid(),
      text_type,
      raw: JSON.stringify({
        type: text_type === 13 ? 'accept' : 'reject',
        sender: meUuid,
        receiver: friendUuid,
        sessionId: invite?.sessionId || '',
        timestamp: Date.now(),
      }),
      recv_user: friendUuid,
      send_user: meUuid,
      timestamp: Date.now(),
    };
    await invoke('send_text_msg', { textQuicMsg: msg });
  };

  const handleAccept = async () => {
    setLoading(true);
    try {
      await sendControlMsg(13); // MSG_TYPE_P2P_VIDEO_CALL_ACCEPT
      // 作为被叫打开 WebRTC 窗口，等待发起方的 offer
      await openWebRTCChatHandler(friendUuid, meUuid, false);
    } catch (e) {
      console.error('[CallInviteMessage] 接受邀请失败:', e);
      message.error(intl.formatMessage({ id: 'chat.footer.webRTCFailed' }));
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await sendControlMsg(14); // MSG_TYPE_P2P_VIDEO_CALL_REJECT
    } catch (e) {
      console.error('[CallInviteMessage] 拒绝邀请失败:', e);
      message.error(intl.formatMessage({ id: 'chat.footer.webRTCFailed' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <VideoCameraOutlined />
      </div>
      <div className={styles.text}>
        <div className={styles.title}>
          {intl.formatMessage({ id: 'webRTCMessage.inviteReceived' })}
        </div>
        <div className={styles.actions}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={loading}
            onClick={handleAccept}
          >
            {intl.formatMessage({ id: 'webRTCMessage.acceptBtn' })}
          </Button>
          <Button
            danger
            icon={<CloseCircleOutlined />}
            loading={loading}
            onClick={handleReject}
          >
            {intl.formatMessage({ id: 'webRTCMessage.rejectBtn' })}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CallInviteMessage);
