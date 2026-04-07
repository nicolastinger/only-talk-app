import chatSvg from '@/assets/svg/chat.svg';
import styles from './index.less';

const DashboardPage: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src={chatSvg} alt="chat" className={styles.svgItem} />
        <div className={styles.text}>选择一个对话开始聊天</div>
      </div>
    </div>
  );
};
export default DashboardPage;
