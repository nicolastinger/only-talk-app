import { useBearStore } from '@/store/store';
import { CheckOutlined, CloseOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import {
  get_accept_friend_request_list,
  get_friend_request_list,
  process_friend_request,
  readContactsNotification,
} from '@workspace/services';
import { FriendRequestInfo, FriendRequestInfoDTO } from '@workspace/types';
import { Avatar, Button, Empty, Modal, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import styles from './index.less';

const FriendRequestsModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const [acceptRequests, setAcceptRequests] = useState<FriendRequestInfo[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequestInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const setAddContacts = useBearStore((state) => state.setAddContacts);

  useEffect(() => {
    if (visible) {
      fetchData();
    }
  }, [visible]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([getAcceptFriendRequestList(), getFriendRequestList()]);
    } finally {
      setLoading(false);
    }
  };

  const getFriendRequestList = async () => {
    let friendRequestInfoDTO: FriendRequestInfoDTO = {};
    try {
      const res = await get_friend_request_list(friendRequestInfoDTO);
      if (res.netSuccess && res.res.status === 200) {
        const data = JSON.parse(res.res.body).data as FriendRequestInfo[];
        setSentRequests(data);
        const ids = data
          .map((item) => item.uuid)
          .filter((item) => item !== undefined);
        if (ids && ids.length > 0) {
          await readContactsNotification(ids, setAddContacts);
        }
      }
    } catch (e) {
      console.log('获取我发起的好友请求失败', e);
    }
  };

  const getAcceptFriendRequestList = async () => {
    let friendRequestInfoDTO: FriendRequestInfoDTO = {};
    try {
      const res = await get_accept_friend_request_list(friendRequestInfoDTO);
      if (res.netSuccess && res.res.status === 200) {
        const data = JSON.parse(res.res.body).data as FriendRequestInfo[];
        setAcceptRequests(data);
        const ids = data
          .map((item) => item.uuid)
          .filter((item) => item !== undefined);
        if (ids && ids.length > 0) {
          await readContactsNotification(ids, setAddContacts);
        }
      }
    } catch (e) {
      console.log('获取我收到的好友请求失败', e);
    }
  };

  const getStatusConfig = (status?: number) => {
    switch (status) {
      case 0:
        return { text: '等待验证', className: styles.pendingStatus, icon: <ClockCircleOutlined /> };
      case 1:
        return { text: '已接受', className: styles.acceptedStatus, icon: <CheckOutlined /> };
      case 2:
        return { text: '已拒绝', className: styles.rejectedStatus, icon: <CloseOutlined /> };
      default:
        return { text: '未知', className: styles.unknownStatus, icon: null };
    }
  };

  const handleAccept = async (uuid: string | undefined) => {
    if (!uuid) return;
    let friendRequestInfoDTO: FriendRequestInfoDTO = {
      accept_message: '我同意',
      request_user: uuid,
      add_type: 'card',
      version: 0,
      accept_status: 1,
    };
    const res = await process_friend_request(friendRequestInfoDTO);
    if (res.netSuccess && res.res.status === 200) {
      await update_local_friend_list();
      await getAcceptFriendRequestList();
    }
  };

  const update_local_friend_list = async () => {
    try {
      await invoke('update_local_friend_list', {});
    } catch (err) {
      console.log(err);
    }
  };

  const handleReject = async (uuid: string | undefined) => {
    if (!uuid) return;
    let friendRequestInfoDTO: FriendRequestInfoDTO = {
      accept_message: '我拒绝',
      request_user: uuid,
      add_type: 'card',
      version: 0,
      accept_status: 2,
    };
    const res = await process_friend_request(friendRequestInfoDTO);
    if (res.netSuccess && res.res.status === 204) {
      await getAcceptFriendRequestList();
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '未知时间';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? '刚刚' : `${minutes}分钟前`;
      }
      return `${hours}小时前`;
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    }
    return date.toLocaleDateString();
  };

  const renderRequestItem = (request: FriendRequestInfo, isReceived: boolean) => {
    const statusConfig = getStatusConfig(request.accept_status);
    
    return (
      <div className={styles.requestItem} key={request.uuid}>
        <div className={styles.avatarSection}>
          <Avatar
            size={48}
            icon={<UserOutlined />}
            className={styles.avatar}
          />
        </div>
        
        <div className={styles.contentSection}>
          <div className={styles.header}>
            <span className={styles.username}>{request.request_user || '未知用户'}</span>
            <span className={`${styles.status} ${statusConfig.className}`}>
              {statusConfig.icon}
              <span>{statusConfig.text}</span>
            </span>
          </div>
          
          <div className={styles.message}>
            {request.request_message || '请求添加你为好友'}
          </div>
          
          <div className={styles.time}>
            {formatTime(request.created_at)}
          </div>
        </div>
        
        <div className={styles.actionSection}>
          {isReceived && request.accept_status === 0 ? (
            <div className={styles.actionButtons}>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleAccept(request.request_user)}
                className={styles.acceptBtn}
              >
                接受
              </Button>
              <Button
                icon={<CloseOutlined />}
                onClick={() => handleReject(request.request_user)}
                className={styles.rejectBtn}
              >
                拒绝
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderEmptyState = (type: 'sent' | 'received') => (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        {type === 'sent' ? '📤' : '📥'}
      </div>
      <div className={styles.emptyText}>
        {type === 'sent' ? '暂无发起的好友请求' : '暂无收到的好友请求'}
      </div>
    </div>
  );

  const items = [
    {
      key: '1',
      label: (
        <span className={styles.tabLabel}>
          <span>我发起的</span>
          {sentRequests.length > 0 && (
            <span className={styles.badge}>{sentRequests.length}</span>
          )}
        </span>
      ),
      children: (
        <div className={styles.requestList}>
          {sentRequests.length === 0 
            ? renderEmptyState('sent')
            : sentRequests.map((request) => renderRequestItem(request, false))
          }
        </div>
      ),
    },
    {
      key: '2',
      label: (
        <span className={styles.tabLabel}>
          <span>收到的</span>
          {acceptRequests.filter(r => r.accept_status === 0).length > 0 && (
            <span className={styles.badge}>{acceptRequests.filter(r => r.accept_status === 0).length}</span>
          )}
        </span>
      ),
      children: (
        <div className={styles.requestList}>
          {acceptRequests.length === 0
            ? renderEmptyState('received')
            : acceptRequests.map((request) => renderRequestItem(request, true))
          }
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={<span className={styles.modalTitle}>好友请求</span>}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={480}
      className={styles.friendRequestsModal}
      centered
    >
      <Tabs items={items} className={styles.tabs} />
    </Modal>
  );
};

export default FriendRequestsModal;
