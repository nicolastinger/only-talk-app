import friendsSvg from '@/assets/svg/friends.svg';
import { useIntl } from '@umijs/max';
import styles from './styles/Dashboard.less';

const Dashboard = () => {
  const intl = useIntl();
  
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src={friendsSvg} alt="friends" className={styles.svgItem} />
        <div className={styles.text}>{intl.formatMessage({ id: 'chat.selectFriend' })}</div>
      </div>
    </div>
  );
};

export default Dashboard;
