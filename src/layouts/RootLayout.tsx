import { useP2pMessageApi } from '@/hooks/useP2pMessageApi';
import { Outlet, useIntl } from '@umijs/max';
import styles from './styles/RootLayout.less';

const RootLayout: React.FC = () => {
  const { state } = useP2pMessageApi();
  console.log('渲染了', state);
  const intl = useIntl();

  return (
    <div className={styles.container}>
      <Outlet />
    </div>
  );
};

export default RootLayout;
