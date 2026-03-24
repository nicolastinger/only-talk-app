import DevAssistant from '@/components/DevAssistant';
import { Outlet } from '@umijs/max';
import styles from './styles/RootLayout.less';

const RootLayout: React.FC = () => {
  return (
    <div className={styles.container}>
      <Outlet />
      <DevAssistant />
    </div>
  );
};

export default RootLayout;
