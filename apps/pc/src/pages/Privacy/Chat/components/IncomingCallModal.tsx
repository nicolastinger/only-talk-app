/**
 * 来电弹窗：对方发起视频通话邀请
 */
import { useIntl } from '@umijs/max';
import { VideoCallInvite } from '@workspace/types';
import { Modal } from 'antd';
import React from 'react';

interface IncomingCallModalProps {
  open: boolean;
  invite: VideoCallInvite | null;
  onAccept: () => void;
  onReject: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  open,
  invite,
  onAccept,
  onReject,
}) => {
  const intl = useIntl();

  return (
    <Modal
      title={intl.formatMessage({ id: 'privacyChat.videoCallInvite' })}
      open={open}
      onOk={onAccept}
      onCancel={onReject}
      okText={intl.formatMessage({ id: 'privacyChat.accept' })}
      cancelText={intl.formatMessage({ id: 'privacyChat.reject' })}
    >
      <p>
        {invite?.from_name || intl.formatMessage({ id: 'privacyChat.other' })}{' '}
        {intl.formatMessage({ id: 'privacyChat.inviteToVideoCall' })}
      </p>
    </Modal>
  );
};

export default IncomingCallModal;
