import DevAssistant from '@/components/DevAssistant';
import { Outlet } from '@umijs/max';
import styles from './styles/RootLayout.less';
import {useP2pMessageApi} from "@/hooks";

const RootLayout: React.FC = () => {
    const {} = useP2pMessageApi();
    
  return (
    <div className={styles.container}>
      <Outlet />
      <DevAssistant />
    </div>
  );
};

export default RootLayout;
