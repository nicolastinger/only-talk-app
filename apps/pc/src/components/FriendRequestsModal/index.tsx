import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useIntl } from '@umijs/max';
import {
  get_accept_friend_request_list,
  get_user_info_with_cache,
  get_friend_request_list,
  getFiles,
  process_friend_request,
  readContactsNotification,
} from '@workspace/services';
import {
  FriendRequestInfo,
  FriendRequestInfoDTO,
  UserInfo,
} from '@workspace/types';
import { Avatar, Button, Modal, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import styles from './index.less';

interface RequestWithUserInfo extends FriendRequestInfo {
  userInfo?: UserInfo | null;
  avatarUrl?: string;
}

const FriendRequestsModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const intl = useIntl();
  const [acceptRequests, setAcceptRequests] = useState<RequestWithUserInfo[]>(
    [],
  );
  const [sentRequests, setSentRequests] = useState<RequestWithUserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const setAddContacts = useBearStore((state) => state.setAddContacts);

  useEffect(() => {
    if (visible) {
      fetchData();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      unlisten = await listen<string>('friend_list_changed', () => {
        fetchData();
      });
    };
    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [visible]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([getAcceptFriendRequestList(), getFriendRequestList()]);
    } finally {
      setLoading(false);
    }
  };

  const enrichRequestWithUserInfo = async (
    request: FriendRequestInfo,
    isReceived: boolean,
  ): Promise<RequestWithUserInfo> => {
    const userUuid = isReceived ? request.request_user : request.accept_user;
    if (!userUuid) {
      return { ...request };
    }

    try {
      const result = await get_user_info_with_cache(userUuid);
      const userInfo = result.user_info;
      let avatarUrl = '';

      if (userInfo?.icon) {
        const fileVos = await getFiles(userInfo.icon);
        avatarUrl = fileVos?.[0]?.tauri_file_path || '';
      }

      console.log(
        `好友请求用户信息 ${userUuid}: from_cache=${result.from_cache}`,
      );

      return {
        ...request,
        userInfo,
        avatarUrl,
      };
    } catch (error) {
      console.log('获取用户信息失败', error);
      return { ...request };
    }
  };

  const getFriendRequestList = async () => {
    let friendRequestInfoDTO: FriendRequestInfoDTO = {};
    try {
      const res = await get_friend_request_list(friendRequestInfoDTO);
      if (res.netSuccess && res.res.status === 200) {
        const data = JSON.parse(res.res.body).data as FriendRequestInfo[];
        const enrichedData = await Promise.all(
          data.map((item) => enrichRequestWithUserInfo(item, false)),
        );
        setSentRequests(enrichedData);
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
        const enrichedData = await Promise.all(
          data.map((item) => enrichRequestWithUserInfo(item, true)),
        );
        setAcceptRequests(enrichedData);
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
        return {
          text: intl.formatMessage({ id: 'friendRequest.waiting' }),
          className: styles.pendingStatus,
          icon: <ClockCircleOutlined />,
        };
      case 1:
        return {
          text: intl.formatMessage({ id: 'friendRequest.accepted' }),
          className: styles.acceptedStatus,
          icon: <CheckOutlined />,
        };
      case 2:
        return {
          text: intl.formatMessage({ id: 'friendRequest.rejected' }),
          className: styles.rejectedStatus,
          icon: <CloseOutlined />,
        };
      default:
        return {
          text: intl.formatMessage({ id: 'friendRequest.unknown' }),
          className: styles.unknownStatus,
          icon: null,
        };
    }
  };

  const handleAccept = async (requestUserId: string | undefined) => {
    if (!requestUserId) return;
    let friendRequestInfoDTO: FriendRequestInfoDTO = {
      accept_message: '我通过了你的好友申请',
      request_user: requestUserId,
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

  const handleReject = async (requestUserId: string | undefined) => {
    if (!requestUserId) return;
    let friendRequestInfoDTO: FriendRequestInfoDTO = {
      accept_message: '我拒绝了你的好友申请',
      request_user: requestUserId,
      add_type: 'card',
      version: 0,
      accept_status: 2,
    };
    const res = await process_friend_request(friendRequestInfoDTO);
    if (res.netSuccess && res.res.status === 204) {
      await update_local_friend_list();
      await getAcceptFriendRequestList();
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp)
      return intl.formatMessage({ id: 'friendRequest.unknownTime' });
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1
          ? intl.formatMessage({ id: 'friendRequest.justNow' })
          : intl.formatMessage({ id: 'friendRequest.minutesAgo' }, { minutes });
      }
      return intl.formatMessage({ id: 'friendRequest.hoursAgo' }, { hours });
    } else if (days === 1) {
      return intl.formatMessage({ id: 'friendRequest.yesterday' });
    } else if (days < 7) {
      return intl.formatMessage({ id: 'friendRequest.daysAgo' }, { days });
    }
    return date.toLocaleDateString();
  };

  const renderRequestItem = (
    request: RequestWithUserInfo,
    isReceived: boolean,
  ) => {
    const statusConfig = getStatusConfig(request.accept_status);
    const displayName =
      request.userInfo?.username ||
      request.request_user ||
      intl.formatMessage({ id: 'userInfo.unknown' });
    const displayAccount = request.userInfo?.account || '';
    const displayInfo = request.userInfo?.info || '';

    return (
      <div className={styles.requestItem} key={request.uuid}>
        <div className={styles.avatarSection}>
          <Avatar
            size={52}
            src={request.avatarUrl || DEFAULT_ICON}
            icon={<UserOutlined />}
            className={styles.avatar}
          />
        </div>

        <div className={styles.contentSection}>
          <div className={styles.header}>
            <div className={styles.userInfo}>
              <span className={styles.username}>{displayName}</span>
              {displayAccount && (
                <span className={styles.account}>@{displayAccount}</span>
              )}
            </div>
            <span className={`${styles.status} ${statusConfig.className}`}>
              {statusConfig.icon}
              <span>{statusConfig.text}</span>
            </span>
          </div>

          {displayInfo && <div className={styles.bio}>{displayInfo}</div>}

          <div className={styles.message}>
            {request.request_message ||
              intl.formatMessage({ id: 'friendRequest.defaultRequestMessage' })}
          </div>

          <div className={styles.time}>{formatTime(request.created_at)}</div>
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
                {intl.formatMessage({ id: 'friendRequest.accept' })}
              </Button>
              <Button
                icon={<CloseOutlined />}
                onClick={() => handleReject(request.request_user)}
                className={styles.rejectBtn}
              >
                {intl.formatMessage({ id: 'friendRequest.reject' })}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderEmptyState = (type: 'sent' | 'received') => (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{type === 'sent' ? '📤' : '📥'}</div>
      <div className={styles.emptyText}>
        {type === 'sent'
          ? intl.formatMessage({ id: 'friendRequest.noSentRequests' })
          : intl.formatMessage({ id: 'friendRequest.noReceivedRequests' })}
      </div>
    </div>
  );

  const items = [
    {
      key: '1',
      label: (
        <span className={styles.tabLabel}>
          <span>{intl.formatMessage({ id: 'friendRequest.sent' })}</span>
          {sentRequests.length > 0 && (
            <span className={styles.badge}>{sentRequests.length}</span>
          )}
        </span>
      ),
      children: (
        <div className={styles.requestList}>
          {sentRequests.length === 0
            ? renderEmptyState('sent')
            : sentRequests.map((request) => renderRequestItem(request, false))}
        </div>
      ),
    },
    {
      key: '2',
      label: (
        <span className={styles.tabLabel}>
          <span>{intl.formatMessage({ id: 'friendRequest.received' })}</span>
          {acceptRequests.filter((r) => r.accept_status === 0).length > 0 && (
            <span className={styles.badge}>
              {acceptRequests.filter((r) => r.accept_status === 0).length}
            </span>
          )}
        </span>
      ),
      children: (
        <div className={styles.requestList}>
          {acceptRequests.length === 0
            ? renderEmptyState('received')
            : acceptRequests.map((request) => renderRequestItem(request, true))}
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <span className={styles.modalTitle}>
          {intl.formatMessage({ id: 'friendRequest.title' })}
        </span>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={560}
      className={styles.friendRequestsModal}
      centered
    >
      <Tabs items={items} className={styles.tabs} />
    </Modal>
  );
};

export default FriendRequestsModal;
