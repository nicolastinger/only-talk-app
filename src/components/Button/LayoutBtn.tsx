import { LayoutBtnProps } from '@/types/user/common';
import styles from './style/index.less';
const LayoutBtn = (props: LayoutBtnProps) => {
  const { icon, active } = props;

  return (
    <div className={`${styles.container} ${active ? styles.active : ''}`}>
      {icon}
    </div>
  );
};

export default LayoutBtn;
