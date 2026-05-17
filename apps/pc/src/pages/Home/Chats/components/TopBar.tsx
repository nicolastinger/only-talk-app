import { useBearStore } from '@/store/store';
import {
  BellOutlined,
  DeleteOutlined,
  MoreOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { delete_friend } from '@workspace/services';
import { FriendVo } from '@workspace/types';
import { Dropdown, Modal, message } from 'antd';
import React, { useState } from 'react';
import styles from './styles/TopBar.less';

interface ChatTopBarProps {
  title: string;
  friendInfo?: FriendVo;
}

const ChatTopBar: React.FC<ChatTopBarProps> = (props: ChatTopBarProps) => {
  const { title, friendInfo } = props;
  const intl = useIntl();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const triggerRefresh = useBearStore((state) => state.triggerRefresh);

  const handleViewProfile = () => {
    if (friendInfo?.friend_id) {
      history.push('/home/contacts/friend?friendId=' + friendInfo.friend_id);
    }
  };

  const handleDeleteFriend = () => {
    setDeleteModalVisible(true);
  };

  const confirmDeleteFriend = async () => {
    if (!friendInfo?.friend_id) return;

    try {
      await delete_friend(friendInfo.friend_id);
      message.success(intl.formatMessage({ id: 'chat.topBar.friendDeleted' }));
      setDeleteModalVisible(false);
      triggerRefresh();
      history.push('/home/chats');
    } catch (error) {
      message.error(intl.formatMessage({ id: 'chat.topBar.deleteFailed' }));
      console.error('删除好友失败:', error);
    }
  };

  const handleMute = () => {
    message.info(intl.formatMessage({ id: 'chat.topBar.muteDeveloping' }));
  };

  const handleBlock = () => {
    message.info(intl.formatMessage({ id: 'chat.topBar.blockDeveloping' }));
  };

  const menuItems = [
    {
      key: 'profile',
      label: intl.formatMessage({ id: 'chat.topBar.viewProfile' }),
      icon: <UserOutlined />,
      onClick: handleViewProfile,
    },
    {
      key: 'mute',
      label: intl.formatMessage({ id: 'chat.topBar.muteNotifications' }),
      icon: <BellOutlined />,
      onClick: handleMute,
    },
    {
      key: 'block',
      label: intl.formatMessage({ id: 'chat.topBar.blockFriend' }),
      icon: <StopOutlined />,
      onClick: handleBlock,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'delete',
      label: intl.formatMessage({ id: 'chat.topBar.deleteFriend' }),
      icon: <DeleteOutlined />,
      danger: true,
      onClick: handleDeleteFriend,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.leftContainer}>{title}</div>
      <div className={styles.rightContainer}>
        <Dropdown
          menu={{ items: menuItems }}
          trigger={['click']}
          placement="bottomRight"
        >
          <MoreOutlined className={styles.moreIcon} />
        </Dropdown>
      </div>
      <Modal
        title={intl.formatMessage({ id: 'chat.topBar.confirmDelete' })}
        open={deleteModalVisible}
        onOk={confirmDeleteFriend}
        onCancel={() => setDeleteModalVisible(false)}
        okText={intl.formatMessage({ id: 'chat.topBar.confirm' })}
        cancelText={intl.formatMessage({ id: 'chat.topBar.cancel' })}
        okButtonProps={{ danger: true }}
      >
        <p>
          {intl.formatMessage(
            { id: 'chat.topBar.confirmDeleteMsg' },
            { name: friendInfo?.friend_name || title },
          )}
        </p>
        <p style={{ color: '#999', fontSize: '12px' }}>
          {intl.formatMessage({ id: 'chat.topBar.deleteWarning' })}
        </p>
      </Modal>
    </div>
  );
};

export default ChatTopBar;
