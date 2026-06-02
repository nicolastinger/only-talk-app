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

const NOTIFICATION_TYPE_MAP: Record<string, { text: string; color: string }> = {
  '1-1-1': { text: '好友申请', color: 'blue' },
  '1-1-2': { text: '好友处理', color: 'green' },
  '1-3-1': { text: '群邀请', color: 'orange' },
  '1-3-2': { text: '群信息更新', color: 'cyan' },
  '1-3-3': { text: '群成员变动', color: 'purple' },
  '1-3-4': { text: '邀请结果', color: 'volcano' },
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

  const getNotificationType = (n: SystemNotification) => {
    const key = `${n.level1}-${n.level2}-${n.level3}`;
    return NOTIFICATION_TYPE_MAP[key] || { text: '系统通知', color: 'default' };
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
      return <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
      <div>
        {unreadCount > 0 && (
          <div className={styles.clearBar}>
            <span className={styles.unreadCount}>
              <Badge count={unreadCount} size="small" />
              <span>条未读</span>
            </span>
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleClearUnread(1, clearLevel2 ?? level2 ?? 0)}
            >
              清空未读
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
      label: '全部',
      children: (
        <div>
          {renderTabContent(1, undefined, -1)}
        </div>
      ),
    },
    {
      key: 'friend',
      label: '好友通知',
      children: renderTabContent(1, 1, 1),
    },
    {
      key: 'group',
      label: '群组通知',
      children: renderTabContent(1, 3, 3),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellOutlined />
          <span>通知中心</span>
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
          全部
        </Button>
        <Button
          type={filter === 'unread' ? 'primary' : 'default'}
          size="small"
          onClick={() => setFilter('unread')}
        >
          未读
        </Button>
        <Button
          type={filter === 'read' ? 'primary' : 'default'}
          size="small"
          onClick={() => setFilter('read')}
        >
          已读
        </Button>
      </div>
      <Tabs items={tabItems} className={styles.tabs} />
    </Modal>
  );
};

export default NotificationPanel;
