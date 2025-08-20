import styles from './index.less';
import talkSvg from '@/assets/svg/talk.svg';

const DashboardPage: React.FC = () => {
  console.log('dashboard');
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src={talkSvg} alt="talk" className={styles.svgItem}/>
      </div>
    </div>
  )
};
export default DashboardPage;
