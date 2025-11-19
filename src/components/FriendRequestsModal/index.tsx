import { Avatar, Button, List, Modal, Tabs } from 'antd';
import { useState } from 'react';
import { CheckOutlined, CloseOutlined, UserOutlined } from '@ant-design/icons';
import styles from './index.less';

interface FriendRequest {
  id: string;
  username: string;
  avatar?: string;
  message: string;
  time: string;
  status: 'pending' | 'accepted' | 'rejected';
}

const FriendRequestsModal = ({ 
  visible, 
  onClose 
}: { 
  visible: boolean; 
  onClose: () => void; 
}) => {
  // 示例数据 - 我发起的好友请求
  const [sentRequests] = useState<FriendRequest[]>([
    {
      id: '1',
      username: '张三',
      message: '你好，我想加你为好友',
      time: '2023-05-15 10:30',
      status: 'pending'
    },
    {
      id: '2',
      username: '李四',
      message: '很高兴认识你',
      time: '2023-05-14 14:20',
      status: 'accepted'
    },
    {
      id: '3',
      username: '王五',
      message: '朋友推荐',
      time: '2023-05-12 09:15',
      status: 'rejected'
    }
  ]);

  // 示例数据 - 收到的好友请求
  const [receivedRequests] = useState<FriendRequest[]>([
    {
      id: '4',
      username: '赵六',
      message: '通过这个平台认识你很高兴',
      time: '2023-05-16 16:45',
      status: 'pending'
    },
    {
      id: '5',
      username: '孙七',
      message: '同事推荐',
      time: '2023-05-15 11:30',
      status: 'pending'
    },
    {
      id: '6',
      username: '周八',
      message: '一起学习交流',
      time: '2023-05-10 18:20',
      status: 'accepted'
    }
  ]);

  const handleAccept = (id: string) => {
    console.log(`接受好友请求: ${id}`);
    // 这里可以添加实际的接受逻辑
  };

  const handleReject = (id: string) => {
    console.log(`拒绝好友请求: ${id}`);
    // 这里可以添加实际的拒绝逻辑
  };

  const items = [
    {
      key: '1',
      label: `我发起的 (${sentRequests.filter(r => r.status === 'pending').length})`,
      children: (
        <List
          dataSource={sentRequests}
          renderItem={(request) => (
            <List.Item
              actions={[
                request.status === 'pending' ? (
                  <span className={styles.pendingStatus}>等待验证</span>
                ) : request.status === 'accepted' ? (
                  <span className={styles.acceptedStatus}>已接受</span>
                ) : (
                  <span className={styles.rejectedStatus}>已拒绝</span>
                )
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar 
                    src={request.avatar} 
                    icon={!request.avatar ? <UserOutlined /> : undefined}
                  >
                    {!request.avatar && request.username.charAt(0)}
                  </Avatar>
                }
                title={request.username}
                description={
                  <div>
                    <div>{request.message}</div>
                    <div className={styles.time}>{request.time}</div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      ),
    },
    {
      key: '2',
      label: `收到的 (${receivedRequests.filter(r => r.status === 'pending').length})`,
      children: (
        <List
          dataSource={receivedRequests}
          renderItem={(request) => (
            <List.Item
              actions={
                request.status === 'pending' ? [
                  <Button 
                    type="primary" 
                    icon={<CheckOutlined />} 
                    onClick={() => handleAccept(request.id)}
                    size="small"
                  >
                    接受
                  </Button>,
                  <Button 
                    icon={<CloseOutlined />} 
                    onClick={() => handleReject(request.id)}
                    size="small"
                  >
                    拒绝
                  </Button>
                ] : request.status === 'accepted' ? [
                  <span className={styles.acceptedStatus}>已接受</span>
                ] : [
                  <span className={styles.rejectedStatus}>已拒绝</span>
                ]
              }
            >
              <List.Item.Meta
                avatar={
                  <Avatar 
                    src={request.avatar} 
                    icon={!request.avatar ? <UserOutlined /> : undefined}
                  >
                    {!request.avatar && request.username.charAt(0)}
                  </Avatar>
                }
                title={request.username}
                description={
                  <div>
                    <div>{request.message}</div>
                    <div className={styles.time}>{request.time}</div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      ),
    },
  ];

  return (
    <Modal
      title="好友请求"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <Tabs items={items} />
    </Modal>
  );
};

export default FriendRequestsModal;