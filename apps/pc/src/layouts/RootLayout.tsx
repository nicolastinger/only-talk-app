import DevAssistant from '@/components/DevAssistant';
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
    </div>
  );
};

export default RootLayout;
