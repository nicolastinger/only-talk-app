import { history, useIntl } from '@umijs/max';
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
  const intl = useIntl();
  const handleLeaveGroup = () => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'chat.group.leaveGroup' }),
      content: intl.formatMessage({ id: 'chat.group.leaveGroupConfirm' }),
      okText: intl.formatMessage({ id: 'chat.group.confirm' }),
      cancelText: intl.formatMessage({ id: 'chat.group.cancel' }),
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
      label: intl.formatMessage({ id: 'chat.group.groupInfo' }),
      onClick: handleViewGroupInfo,
    },
    {
      key: 'settings',
      label: intl.formatMessage({ id: 'chat.group.groupSettings' }),
      onClick: () => history.push(`/home/chats/group-settings?groupId=${groupId}`),
    },
    {
      type: 'divider',
    },
    {
      key: 'leave',
      label: intl.formatMessage({ id: 'chat.group.leaveGroup' }),
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
