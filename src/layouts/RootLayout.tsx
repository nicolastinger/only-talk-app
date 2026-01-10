import { Outlet } from '@umijs/max';
import styles from './styles/RootLayout.less';

const RootLayout: React.FC = () => {
  // const {  } = useP2pMessageApi();

  return (
    <div className={styles.container}>
      <Outlet />
    </div>
  );
};

export default RootLayout;
