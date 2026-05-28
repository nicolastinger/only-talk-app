import React from 'react';
import { Spin } from 'antd';
import { useBearStore } from '@/store/store';
import styles from './index.module.less';

/**
 * 全局同步加载遮罩
 * 当 QUIC 重连后同步离线消息时显示，阻止用户操作
 * 超时 3 分钟自动关闭，或收到 sync_complete 事件后关闭
 */
const SyncLoadingOverlay: React.FC = () => {
  const isSyncing = useBearStore((state) => state.isSyncing);

  if (!isSyncing) return null;

  return (
    <div className={styles.overlay}>
      <Spin size="large" tip="正在同步离线消息..." />
    </div>
  );
};

export default SyncLoadingOverlay;
