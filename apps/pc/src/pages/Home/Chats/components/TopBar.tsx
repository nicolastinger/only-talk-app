import { delete_friend } from '@workspace/services';
import { FriendVo } from '@workspace/types';
import { Dropdown, Modal, message } from 'antd';
import { history } from '@umijs/max';
import React, { useState } from 'react';
import { MoreOutlined, UserOutlined, DeleteOutlined, StopOutlined, BellOutlined } from '@ant-design/icons';
import { useBearStore } from '@/store/store';
import styles from './styles/TopBar.less';

interface ChatTopBarProps {
  title: string;
  friendInfo?: FriendVo;
}

const ChatTopBar: React.FC<ChatTopBarProps> = (props: ChatTopBarProps) => {
  const { title, friendInfo } = props;
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
      message.success('好友已删除');
      setDeleteModalVisible(false);
      triggerRefresh();
      history.push('/home/chats');
    } catch (error) {
      message.error('删除好友失败');
      console.error('删除好友失败:', error);
    }
  };

  const handleMute = () => {
    message.info('消息免打扰功能开发中');
  };

  const handleBlock = () => {
    message.info('屏蔽好友功能开发中');
  };

  const menuItems = [
    {
      key: 'profile',
      label: '查看资料',
      icon: <UserOutlined />,
      onClick: handleViewProfile,
    },
    {
      key: 'mute',
      label: '消息免打扰',
      icon: <BellOutlined />,
      onClick: handleMute,
    },
    {
      key: 'block',
      label: '屏蔽好友',
      icon: <StopOutlined />,
      onClick: handleBlock,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'delete',
      label: '删除好友',
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
        title="确认删除好友"
        open={deleteModalVisible}
        onOk={confirmDeleteFriend}
        onCancel={() => setDeleteModalVisible(false)}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除好友「{friendInfo?.friend_name || title}」吗？</p>
        <p style={{ color: '#999', fontSize: '12px' }}>删除后聊天记录将保留，但对方将从好友列表中移除。</p>
      </Modal>
    </div>
  );
};

export default ChatTopBar;
