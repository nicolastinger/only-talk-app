import DevAssistant from '@/components/DevAssistant';
import { QuicDisconnectAlert } from '@/components/QuicDisconnectAlert';
import { useP2pMessageApi, useWebRTCSignalApi } from '@/hooks';
import { Outlet } from '@umijs/max';
import styles from './styles/RootLayout.less';

const RootLayout: React.FC = () => {
  useP2pMessageApi();
  useWebRTCSignalApi();

  return (
    <div className={styles.container}>
      <Outlet />
      <DevAssistant />
      <QuicDisconnectAlert />
    </div>
  );
};

export default RootLayout;
