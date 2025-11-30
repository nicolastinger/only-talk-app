import {
  get_accept_friend_request_list,
  get_friend_request_list,
  process_friend_request,
} from '@/services/userService';
import { useBearStore } from '@/store/store';
import { FriendRequestInfo, FriendRequestInfoDTO } from '@/types/friend';
import { CheckOutlined, CloseOutlined, UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { Avatar, Button, List, Modal, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import styles from './index.less';
import { readContactsNotification } from '@/services/ReadSystemMotification';

const FriendRequestsModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const [acceptRequests, setAcceptRequests] = useState<FriendRequestInfo[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequestInfo[]>([]);
  const setAddContacts = useBearStore((state) => state.setAddContacts);

  useEffect(() => {
    if (visible) {
      getAcceptFriendRequestList();
      getFriendRequestList();
    }
  }, [visible]);

  // 获取我发起的好友请求
  const getFriendRequestList = async () => {
    let friendRequestInfoDTO: FriendRequestInfoDTO = {};
    try {
      const res = await get_friend_request_list(friendRequestInfoDTO);
      if (res.netSuccess && res.res.status === 200) {
        const data = JSON.parse(res.res.body).data as FriendRequestInfo[];
        console.log('获取我发起的好友请求成功', data);
        setSentRequests(data);
        // 已读系统通知
        const ids = data.map((item) => item.uuid).filter((item) => item !== undefined);
        if (ids && ids.length > 0) {
          await readContactsNotification(ids, setAddContacts);
        }
      }
    } catch (e) {
      console.log('获取我发起的好友请求失败', e);
    }
  };

  // 获取向我发起的好友请求
  const getAcceptFriendRequestList = async () => {
    let friendRequestInfoDTO: FriendRequestInfoDTO = {};
    try {
      const res = await get_accept_friend_request_list(friendRequestInfoDTO);
      if (res.netSuccess && res.res.status === 200) {
        const data = JSON.parse(res.res.body).data as FriendRequestInfo[];
        console.log('获取我收到的好友请求成功', data);
        setAcceptRequests(data);

        // 已读系统通知
        const ids = data.map((item) => item.uuid).filter((item) => item !== undefined);
        if (ids && ids.length > 0) {
          await readContactsNotification(ids, setAddContacts);
        }
      }
    } catch (e) {
      console.log('获取我收到的好友请求失败', e);
    }
  };

  // 根据accept_status获取状态文本
  const getStatusText = (status?: number) => {
    if (status === undefined) return '未知';
    switch (status) {
      case 0:
        return '等待验证';
      case 1:
        return '已接受';
      case 2:
        return '已拒绝';
      default:
        return '未知';
    }
  };

  // 根据accept_status获取状态样式类名
  const getStatusClassName = (status?: number) => {
    if (status === undefined) return styles.unknownStatus;
    switch (status) {
      case 0:
        return styles.pendingStatus;
      case 1:
        return styles.acceptedStatus;
      case 2:
        return styles.rejectedStatus;
      default:
        return styles.unknownStatus;
    }
  };

  const handleAccept = async (uuid: string | undefined) => {
    if (!uuid) return;
    console.log(`接受好友请求: ${uuid}`);
    // 这里可以添加实际的接受逻辑
    let friendRequestInfoDTO: FriendRequestInfoDTO = {
      accept_message: '我同意',
      request_user: uuid,
      add_type: 'card',
      version: 0,
      accept_status: 1,
    };
    const res = await process_friend_request(friendRequestInfoDTO);
    if (res.netSuccess && res.res.status === 204) {
      getAcceptFriendRequestList();
    }
  };

  const handleReject = async (uuid: string | undefined) => {
    if (!uuid) return;
    console.log(`拒绝好友请求: ${uuid}`);
    // 这里可以添加实际的拒绝逻辑
    let friendRequestInfoDTO: FriendRequestInfoDTO = {
      accept_message: '我拒绝',
      request_user: uuid,
      add_type: 'card',
      version: 0,
      accept_status: 2,
    };
    const res = await process_friend_request(friendRequestInfoDTO);
    if (res.netSuccess && res.res.status === 204) {
      getAcceptFriendRequestList();
    }
  };

  const items = [
    {
      key: '1',
      label: `我发起的 (${sentRequests.length})`,
      children: (
        <List
          dataSource={sentRequests}
          renderItem={(request) => (
            <List.Item
              actions={[
                <span className={getStatusClassName(request.accept_status)}>
                  {getStatusText(request.accept_status)}
                </span>,
              ]}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} />}
                title={request.request_user || '未知用户'}
                description={
                  <div>
                    <div>{request.request_message || '无消息'}</div>
                    <div className={styles.time}>
                      {request.created_at
                        ? new Date(request.created_at).toLocaleString()
                        : '未知时间'}
                    </div>
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
      label: `收到的 (${acceptRequests.length})`,
      children: (
        <List
          dataSource={acceptRequests}
          renderItem={(request) => (
            <List.Item
              actions={
                request.accept_status === 0
                  ? [
                      <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        onClick={() =>
                          request.uuid && handleAccept(request.request_user)
                        }
                        size="small"
                      >
                        接受
                      </Button>,
                      <Button
                        icon={<CloseOutlined />}
                        onClick={() =>
                          request.uuid && handleReject(request.request_user)
                        }
                        size="small"
                      >
                        拒绝
                      </Button>,
                    ]
                  : [
                      <span
                        className={getStatusClassName(request.accept_status)}
                      >
                        {getStatusText(request.accept_status)}
                      </span>,
                    ]
              }
            >
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} />}
                title={request.request_user || '未知用户'}
                description={
                  <div>
                    <div>{request.request_message || '无消息'}</div>
                    <div className={styles.time}>
                      {request.created_at
                        ? new Date(request.created_at).toLocaleString()
                        : '未知时间'}
                    </div>
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
