import { ReloadOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { message, Tooltip } from 'antd';
import { useState } from 'react';
import styles from './QuicReconnectButton.less';

const QuicReconnectButton = () => {
  const [loading, setLoading] = useState(false);

  const handleReconnect = async () => {
    try {
      setLoading(true);
      await invoke('reconnect_quic_command');
      message.success('QUIC重连请求已发送');
    } catch (error) {
      message.error(`重连失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title="重新连接QUIC" placement="bottom">
      <div
        className={styles.quicButton}
        onClick={handleReconnect}
        style={{ opacity: loading ? 0.5 : 1 }}
      >
        <ReloadOutlined spin={loading} />
      </div>
    </Tooltip>
  );
};

export default QuicReconnectButton;
