import chatSvg from '@/assets/svg/chat.svg';
import { useIntl } from '@umijs/max';
import styles from './index.less';

const DashboardPage: React.FC = () => {
  const intl = useIntl();
  
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src={chatSvg} alt="chat" className={styles.svgItem} />
        <div className={styles.text}>{intl.formatMessage({ id: 'chat.selectConversation' })}</div>
      </div>
    </div>
  );
};
export default DashboardPage;
