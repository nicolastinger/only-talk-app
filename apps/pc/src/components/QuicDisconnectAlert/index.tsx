import { useQuicDisconnect } from '@/hooks/useQuicDisconnect';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import React, { useState, useEffect } from 'react';
import './QuicDisconnectAlert.less';

const QuicDisconnectAlert: React.FC = () => {
  const intl = useIntl();
  const { isConnected, connectionState, message, resetConnection } =
    useQuicDisconnect();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [isConnected]);

  const handleReconnect = async () => {
    if (isReconnecting) return;

    try {
      setIsReconnecting(true);
      await invoke('reconnect_quic_command');
      resetConnection();
    } catch (error) {
      console.error('重新连接失败:', error);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  const statusText =
    connectionState === 'disconnected'
      ? intl.formatMessage({ id: 'quicDisconnect.disconnected' })
      : intl.formatMessage({ id: 'quicDisconnect.reconnecting' });

  return (
    <div className="quic-disconnect-alert">
      <div className="quic-disconnect-alert-overlay" />
      <div className="quic-disconnect-alert-content">
        <button
          className="quic-disconnect-alert-close"
          onClick={handleClose}
          title={intl.formatMessage({ id: 'quicDisconnect.closeTip' })}
        >
          ✕
        </button>

        <div className="quic-disconnect-alert-icon">
          <svg viewBox="0 0 1024 1024" width="64" height="64">
            <path
              d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"
              fill="#FF4D4F"
            />
            <path
              d="M464 336a48 48 0 1 0 96 0 48 48 0 1 0-96 0zm72 112h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V456c0-4.4-3.6-8-8-8z"
              fill="#FF4D4F"
            />
          </svg>
        </div>

        <h2 className="quic-disconnect-alert-title">{statusText}</h2>

        <p className="quic-disconnect-alert-message">
          {message || intl.formatMessage({ id: 'quicDisconnect.defaultMessage' })}
        </p>

        <div className="quic-disconnect-alert-tips">
          <p>{intl.formatMessage({ id: 'quicDisconnect.suggestions' })}</p>
          <ul>
            <li>{intl.formatMessage({ id: 'quicDisconnect.checkNetwork' })}</li>
            <li>{intl.formatMessage({ id: 'quicDisconnect.checkFirewall' })}</li>
            <li>{intl.formatMessage({ id: 'quicDisconnect.clickReconnect' })}</li>
          </ul>
        </div>

        <button
          className={`quic-disconnect-alert-button ${
            isReconnecting ? 'loading' : ''
          }`}
          onClick={handleReconnect}
          disabled={isReconnecting}
        >
          {isReconnecting ? (
            <>
              <span className="loading-spinner" />
              {intl.formatMessage({ id: 'quicDisconnect.reconnecting' })}
            </>
          ) : (
            <>
              <span className="button-icon">🔄</span>
              {intl.formatMessage({ id: 'quicDisconnect.reconnect' })}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export { QuicDisconnectAlert };