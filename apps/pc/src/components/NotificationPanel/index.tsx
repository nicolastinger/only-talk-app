import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { BellOutlined, CheckOutlined, UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import { clearUnreadByLevel, getFiles, get_user_info_with_cache, getUnreadNotificationCounts } from '@workspace/services';
import { SystemNotification, UserInfo } from '@workspace/types';
import { Avatar, Badge, Button, Empty, Modal, Tabs, Tag } from 'antd';
import { useEffect, useState } from 'react';
import styles from './index.less';

interface NotificationPanelProps {
  visible: boolean;
  onClose: () => void;
}

const NOTIFICATION_TYPE_COLORS: Record<string, string> = {
  '1-1-1': 'blue',
  '1-1-2': 'green',
  '1-3-1': 'orange',
  '1-3-2': 'cyan',
  '1-3-3': 'purple',
  '1-3-4': 'volcano',
};

const NotificationPanel = ({ visible, onClose }: NotificationPanelProps) => {
  const intl = useIntl();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const menuUnread = useBearStore((state) => state.menuUnread);
  const setMenuUnread = useBearStore((state) => state.setMenuUnread);

  useEffect(() => {
    if (visible) {
      loadNotifications();
    }
  }, [visible]);

  const loadNotifications = async () => {
    try {
      const list = await invoke<SystemNotification[]>('get_system_notification', {
        isRead: null,
      });
      setNotifications(list || []);
    } catch (e) {
      console.log('获取通知列表失败', e);
    }
  };

  const handleClearUnread = async (level1: number, level2: number) => {
    await clearUnreadByLevel(level1, level2, -1, -1);
    const counts = await getUnreadNotificationCounts();
    setMenuUnread({
      ...menuUnread,
      contacts: counts.contacts,
      groups: counts.groups,
      total: counts.contacts + counts.groups,
    });
    loadNotifications();
  };

  const handleMarkRead = async (id: string) => {
    try {
      await invoke<number>('batch_read_system_notification', { readIds: [id] });
      loadNotifications();
    } catch (e) {
      console.log('标记已读失败', e);
    }
  };

  const getFilteredNotifications = (level1: number, level2?: number) => {
    let list = notifications.filter((n) => n.level1 === level1);
    if (level2 !== undefined) {
      list = list.filter((n) => n.level2 === level2);
    }
    if (filter === 'unread') {
      list = list.filter((n) => n.is_read === false);
    } else if (filter === 'read') {
      list = list.filter((n) => n.is_read === true);
    }
    return list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1
          ? intl.formatMessage({ id: 'notification.justNow' })
          : intl.formatMessage(
              { id: 'notification.minutesAgo' },
              { minutes },
            );
      }
      return intl.formatMessage({ id: 'notification.hoursAgo' }, { hours });
    } else if (days === 1) {
      return intl.formatMessage({ id: 'notification.yesterday' });
    } else if (days < 7) {
      return intl.formatMessage({ id: 'notification.daysAgo' }, { days });
    }
    return date.toLocaleDateString();
  };

  const getNotificationType = (n: SystemNotification) => {
    const key = `${n.level1}-${n.level2}-${n.level3}`;
    const color = NOTIFICATION_TYPE_COLORS[key] || 'default';
    const typeKeyMap: Record<string, string> = {
      '1-1-1': 'notification.type.friendRequest',
      '1-1-2': 'notification.type.friendProcess',
      '1-3-1': 'notification.type.groupInvite',
      '1-3-2': 'notification.type.groupInfoUpdate',
      '1-3-3': 'notification.type.groupMemberChange',
      '1-3-4': 'notification.type.inviteResult',
    };
    const textKey = typeKeyMap[key] || 'notification.type.system';
    return { text: intl.formatMessage({ id: textKey }), color };
  };

  const renderNotificationItem = (n: SystemNotification) => {
    const type = getNotificationType(n);
    const isUnread = n.is_read === false;

    return (
      <div
        key={n.id}
        className={`${styles.notifyItem} ${isUnread ? styles.unread : ''}`}
        onClick={() => isUnread && handleMarkRead(n.id)}
      >
        <div className={styles.notifyHeader}>
          <Tag color={type.color}>{type.text}</Tag>
          <span className={styles.notifyTime}>{formatTime(n.created_at)}</span>
          {isUnread && <span className={styles.unreadDot} />}
        </div>
        {n.title && <div className={styles.notifyTitle}>{n.title}</div>}
        {n.content && <div className={styles.notifyContent}>{n.content}</div>}
      </div>
    );
  };

  const renderTabContent = (level1: number, level2?: number, clearLevel2?: number) => {
    const list = getFilteredNotifications(level1, level2);
    const unreadCount = list.filter(
      (n) => n.is_read === false,
    ).length;

    if (list.length === 0) {
      return <Empty description={intl.formatMessage({ id: 'notification.noNotifications' })} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
      <div>
        {unreadCount > 0 && (
          <div className={styles.clearBar}>
            <span className={styles.unreadCount}>
              <Badge count={unreadCount} size="small" />
              <span>{intl.formatMessage({ id: 'notification.unreadCount' })}</span>
            </span>
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleClearUnread(1, clearLevel2 ?? level2 ?? 0)}
            >
              {intl.formatMessage({ id: 'notification.clearUnread' })}
            </Button>
          </div>
        )}
        <div className={styles.notifyList}>
          {list.map(renderNotificationItem)}
        </div>
      </div>
    );
  };

  const tabItems = [
    {
      key: 'all',
      label: intl.formatMessage({ id: 'notification.tab.all' }),
      children: (
        <div>
          {renderTabContent(1, undefined, -1)}
        </div>
      ),
    },
    {
      key: 'friend',
      label: intl.formatMessage({ id: 'notification.tab.friend' }),
      children: renderTabContent(1, 1, 1),
    },
    {
      key: 'group',
      label: intl.formatMessage({ id: 'notification.tab.group' }),
      children: renderTabContent(1, 3, 3),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellOutlined />
          <span>{intl.formatMessage({ id: 'notification.title' })}</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={560}
      className={styles.notificationPanel}
      centered
    >
      <div className={styles.filterBar}>
        <Button
          type={filter === 'all' ? 'primary' : 'default'}
          size="small"
          onClick={() => setFilter('all')}
        >
          {intl.formatMessage({ id: 'notification.filter.all' })}
        </Button>
        <Button
          type={filter === 'unread' ? 'primary' : 'default'}
          size="small"
          onClick={() => setFilter('unread')}
        >
          {intl.formatMessage({ id: 'notification.filter.unread' })}
        </Button>
        <Button
          type={filter === 'read' ? 'primary' : 'default'}
          size="small"
          onClick={() => setFilter('read')}
        >
          {intl.formatMessage({ id: 'notification.filter.read' })}
        </Button>
      </div>
      <Tabs items={tabItems} className={styles.tabs} />
    </Modal>
  );
};

export default NotificationPanel;
