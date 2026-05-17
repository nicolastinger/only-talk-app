import { DisconnectOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { message, Tooltip } from 'antd';
import { useState } from 'react';
import styles from './QuicDisconnectButton.less';

const QuicDisconnectButton = () => {
  const [loading, setLoading] = useState(false);

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      await invoke('disconnect_quic_command');
      message.success('QUIC连接已断开');
    } catch (error) {
      message.error(`断开连接失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title="断开QUIC连接" placement="bottom">
      <div
        className={styles.quicButton}
        onClick={handleDisconnect}
        style={{ opacity: loading ? 0.5 : 1 }}
      >
        <DisconnectOutlined spin={loading} />
      </div>
    </Tooltip>
  );
};

export default QuicDisconnectButton;
