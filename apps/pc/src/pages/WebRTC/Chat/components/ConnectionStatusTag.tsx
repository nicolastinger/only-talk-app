/**
 * 连接状态标签
 */
import { useIntl } from '@umijs/max';
import { Tag } from 'antd';
import React from 'react';

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

const ConnectionStatusTag: React.FC<{ status: ConnectionState }> = ({
  status,
}) => {
  const intl = useIntl();
  switch (status) {
    case 'connected':
      return (
        <Tag color="success">
          {intl.formatMessage({ id: 'webrtc.connected' })}
        </Tag>
      );
    case 'connecting':
      return (
        <Tag color="warning">
          {intl.formatMessage({ id: 'webrtc.connecting' })}
        </Tag>
      );
    case 'disconnected':
      return (
        <Tag color="error">
          {intl.formatMessage({ id: 'webrtc.disconnected' })}
        </Tag>
      );
    case 'failed':
      return (
        <Tag color="error">
          {intl.formatMessage({ id: 'webrtc.connectionFailed' })}
        </Tag>
      );
    default:
      return null;
  }
};

export default ConnectionStatusTag;
