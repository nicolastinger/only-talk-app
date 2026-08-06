import DevAssistant from '@/components/DevAssistant';
import { QuicDisconnectAlert } from '@/components/QuicDisconnectAlert';
import SyncLoadingOverlay from '@/components/SyncLoadingOverlay';
import { useP2pMessageApi, useWebRTCSignalApi } from '@/hooks';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Outlet } from '@umijs/max';
import { useEffect } from 'react';
import styles from './styles/RootLayout.less';

const RootLayout: React.FC = () => {
  useP2pMessageApi();
  useWebRTCSignalApi();

  // 窗口在 tauri.conf.json 中配置为 visible:false，首帧渲染完成后再显示，避免白屏
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    // 双重 requestAnimationFrame 确保首个画面已经绘制完成再显示窗口
    const showWindow = () => {
      getCurrentWindow()
        .show()
        .catch(() => {});
    };
    requestAnimationFrame(() => requestAnimationFrame(showWindow));
  }, []);

  return (
    <div className={styles.container}>
      <Outlet />
      <DevAssistant />
      <QuicDisconnectAlert />
      <SyncLoadingOverlay />
    </div>
  );
};

export default RootLayout;
