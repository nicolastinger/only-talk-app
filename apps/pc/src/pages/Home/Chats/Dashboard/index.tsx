import { useState } from 'react';
import chatSvg from '@/assets/svg/chat.svg';
import CreateGroupModal from '@/pages/Home/Chats/components/CreateGroupModal';
import { useBearStore } from '@/store/store';
import { useIntl } from '@umijs/max';
import { Button } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import styles from './index.less';

const DashboardPage: React.FC = () => {
  const intl = useIntl();
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const triggerRefresh = useBearStore((state) => state.triggerRefresh);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src={chatSvg} alt="chat" className={styles.svgItem} />
        <div className={styles.text}>
          {intl.formatMessage({ id: 'chat.selectConversation' })}
        </div>
        <Button
          type="primary"
          icon={<TeamOutlined />}
          onClick={() => setCreateGroupVisible(true)}
          className={styles.groupBtn}
        >
          发起群会话
        </Button>
      </div>
      <CreateGroupModal
        visible={createGroupVisible}
        onCancel={() => setCreateGroupVisible(false)}
        onSuccess={() => {
          setCreateGroupVisible(false);
          triggerRefresh();
        }}
      />
    </div>
  );
};
export default DashboardPage;
