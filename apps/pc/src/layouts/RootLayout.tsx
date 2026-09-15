import DevAssistant from '@/components/DevAssistant';
import SyncLoadingOverlay from '@/components/SyncLoadingOverlay';
import { useP2pMessageApi, useWebRTCIncomingCall, useWebRTCSignalApi } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { ConfigProvider, theme } from 'antd';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Outlet } from '@umijs/max';
import { useEffect } from 'react';
import styles from './styles/RootLayout.less';

const RootLayout: React.FC = () => {
  useP2pMessageApi();
  useWebRTCSignalApi();
  // 全局监听视频通话来电（不依赖所在聊天会话），确保不漏接
  useWebRTCIncomingCall();

  // 启动时恢复持久化主题，并让 antd 组件跟随深浅色
  const { effectiveMode } = useTheme();

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
    <ConfigProvider
      theme={{
        algorithm:
          effectiveMode === 'dark'
            ? theme.darkAlgorithm
            : theme.defaultAlgorithm,
      }}
    >
      <div className={styles.container}>
        <Outlet />
        <DevAssistant />
        <SyncLoadingOverlay />
      </div>
    </ConfigProvider>
  );
};

export default RootLayout;
