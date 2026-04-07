import friendsSvg from '@/assets/svg/friends.svg';
import styles from './styles/Dashboard.less';

const Dashboard = () => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src={friendsSvg} alt="friends" className={styles.svgItem} />
        <div className={styles.text}>选择一个好友开始聊天</div>
      </div>
    </div>
  );
};

export default Dashboard;
