import React, { useState } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useQuicDisconnect } from '@/hooks/useQuicDisconnect';
import './QuicDisconnectAlert.less';

/**
 * QUIC连接断开提示组件
 * 当QUIC连接断开时显示显眼的提示信息，引导用户检查网络并重启连接
 */
const QuicDisconnectAlert: React.FC = () => {
  const { isConnected, message, resetConnection } = useQuicDisconnect();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // 处理关闭弹窗
  const handleClose = () => {
    setIsVisible(false);
  };

  // 处理重新连接
  const handleReconnect = async () => {
    if (isReconnecting) return;
    
    try {
      setIsReconnecting(true);
      await invoke('reconnect_quic_command');
      // 重连请求已发送，重置状态
      resetConnection();
      // 重连后显示弹窗
      setIsVisible(true);
    } catch (error) {
      console.error('重新连接失败:', error);
    } finally {
      setIsReconnecting(false);
    }
  };

  // 如果连接正常或用户已关闭弹窗，不显示任何内容
  if (isConnected || !isVisible) {
    return null;
  }

  return (
    <div className="quic-disconnect-alert">
      <div className="quic-disconnect-alert-overlay" />
      <div className="quic-disconnect-alert-content">
        <button className="quic-disconnect-alert-close" onClick={handleClose}>
          <CloseOutlined />
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
        
        <h2 className="quic-disconnect-alert-title">连接已断开</h2>
        
        <p className="quic-disconnect-alert-message">
          {message || 'QUIC连接已断开，请检查您的网络环境'}
        </p>
        
        <div className="quic-disconnect-alert-tips">
          <p>💡 建议操作：</p>
          <ul>
            <li>检查网络连接是否正常</li>
            <li>确认防火墙未阻止应用</li>
            <li>点击下方按钮重新连接</li>
          </ul>
        </div>
        
        <button
          className={`quic-disconnect-alert-button ${isReconnecting ? 'loading' : ''}`}
          onClick={handleReconnect}
          disabled={isReconnecting}
        >
          {isReconnecting ? (
            <>
              <span className="loading-spinner" />
              正在重连...
            </>
          ) : (
            <>
              <span className="button-icon">🔄</span>
              重新连接 QUIC
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export { QuicDisconnectAlert };
