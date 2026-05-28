import { history } from '@umijs/max';
import { Avatar, Dropdown, Modal, Typography } from 'antd';
import { UserOutlined, MoreOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import styles from './styles/TopBar.less';

interface GroupTopBarProps {
  title: string;
  groupId: string;
  memberCount: number;
}

const GroupTopBar: React.FC<GroupTopBarProps> = ({
  title,
  groupId,
  memberCount,
}) => {
  const handleLeaveGroup = () => {
    Modal.confirm({
      title: '退出群聊',
      content: '确定要退出该群聊吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await invoke('leave_group_command', { groupId });
          history.push('/home/chats/dashboard');
        } catch (e) {
          console.log('退出群聊失败', e);
        }
      },
    });
  };

  const handleViewGroupInfo = () => {
    history.push(`/home/chats/group-info?groupId=${groupId}`);
  };

  const items: MenuProps['items'] = [
    {
      key: 'info',
      label: '群聊信息',
      onClick: handleViewGroupInfo,
    },
    {
      key: 'settings',
      label: '群设置',
      onClick: () => history.push(`/home/chats/group-settings?groupId=${groupId}`),
    },
    {
      type: 'divider',
    },
    {
      key: 'leave',
      label: '退出群聊',
      danger: true,
      onClick: handleLeaveGroup,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.leftContainer}>{title}</div>
      <div className={styles.rightContainer}>
        <Dropdown
          menu={{ items }}
          trigger={['click']}
          placement="bottomRight"
        >
          <MoreOutlined className={styles.moreIcon} />
        </Dropdown>
      </div>
    </div>
  );
};

export default GroupTopBar;
