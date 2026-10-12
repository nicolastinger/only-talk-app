import { history, useIntl } from '@umijs/max';
import { Avatar, Dropdown, Modal, Typography } from 'antd';
import { UserOutlined, MoreOutlined, WarningOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { ReportTargetType } from '@workspace/types';
import ReportModal from '@/components/ReportModal';
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
  const [reportModalVisible, setReportModalVisible] = useState(false);
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
      key: 'report',
      label: intl.formatMessage({ id: 'report.action' }),
      icon: <WarningOutlined />,
      onClick: () => setReportModalVisible(true),
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
      <ReportModal
        open={reportModalVisible}
        targetType={ReportTargetType.GROUP}
        targetUuid={groupId}
        targetName={title}
        onClose={() => setReportModalVisible(false)}
      />
    </div>
  );
};

export default GroupTopBar;
