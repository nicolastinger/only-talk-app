import thinkSvg from '@/assets/svg/think.svg';
import styles from './styles/Dashboard.less';

const Dashboard = () => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src={thinkSvg} alt="think" className={styles.svgItem} />
      </div>
    </div>
  );
};

export default Dashboard;
