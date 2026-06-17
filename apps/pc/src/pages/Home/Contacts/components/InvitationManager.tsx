import { GroupInvitationVo } from '@workspace/types';
import {
  get_pending_invitations,
  get_sent_invitations,
  accept_group_invitation,
  decline_group_invitation,
  clearUnreadByLevel,
  getUnreadNotificationCounts,
} from '@workspace/services';
import { Modal, Tabs, Tag, Empty, Button, message, Popconfirm } from 'antd';
import { ClearOutlined, TeamOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useBearStore } from '@/store/store';
import { useIntl } from '@umijs/max';
import { useEffect, useState } from 'react';
import styles from './styles/InvitationManager.less';

interface InvitationManagerProps {
  visible: boolean;
  onCancel: () => void;
}

const formatTime = (timestamp: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const InvitationManager: React.FC<InvitationManagerProps> = ({
  visible,
  onCancel,
}) => {
  const intl = useIntl();
  const [receivedList, setReceivedList] = useState<GroupInvitationVo[]>([]);
  const [sentList, setSentList] = useState<GroupInvitationVo[]>([]);
  const setMenuUnread = useBearStore((state) => state.setMenuUnread);

  const getStatusConfig = (status: number) => {
    const statusMap: Record<number, { text: string; color: string }> = {
      1: { text: intl.formatMessage({ id: 'contacts.invitation.statusPending' }), color: 'processing' },
      2: { text: intl.formatMessage({ id: 'contacts.invitation.statusAccepted' }), color: 'success' },
      3: { text: intl.formatMessage({ id: 'contacts.invitation.statusRejected' }), color: 'error' },
    };
    return statusMap[status] || { text: intl.formatMessage({ id: 'contacts.invitation.statusUnknown' }), color: 'default' };
  };

  const refreshUnreadCounts = async () => {
    try {
      const counts = await getUnreadNotificationCounts();
      setMenuUnread({
        contacts: counts.contacts,
        groups: counts.groups,
        system: 0,
        settings: 0,
        total: counts.contacts + counts.groups,
      });
    } catch (e) {
      console.log('刷新未读通知数量失败', e);
    }
  };

  useEffect(() => {
    if (visible) {
      loadAll();
    }
  }, [visible]);

  const loadAll = async () => {
    try {
      const [received, sent] = await Promise.all([
        get_pending_invitations(),
        get_sent_invitations(),
      ]);
      setReceivedList(received || []);
      setSentList(sent || []);
    } catch (err) {
      console.error('获取邀请列表失败', err);
      message.error(intl.formatMessage({ id: 'contacts.invitation.fetchError' }));
    }
  };

  const handleClearUnread = async () => {
    await clearUnreadByLevel(1, 3, -1, -1);
    refreshUnreadCounts();
    message.success(intl.formatMessage({ id: 'contacts.invitation.clearUnreadSuccess' }));
  };

  const handleAccept = async (groupUuid: string) => {
    try {
      const ok = await accept_group_invitation(groupUuid);
      if (ok) {
        message.success(intl.formatMessage({ id: 'contacts.invitation.acceptSuccess' }));
        loadAll();
      } else {
        message.warning(intl.formatMessage({ id: 'contacts.invitation.acceptFailed' }));
      }
    } catch (err) {
      message.error(intl.formatMessage({ id: 'contacts.invitation.acceptFailed' }));
    }
  };

  const handleDecline = async (groupUuid: string) => {
    try {
      const ok = await decline_group_invitation(groupUuid);
      if (ok) {
        message.success(intl.formatMessage({ id: 'contacts.invitation.rejectSuccess' }));
        loadAll();
      } else {
        message.warning(intl.formatMessage({ id: 'contacts.invitation.rejectFailed' }));
      }
    } catch (err) {
      message.error(intl.formatMessage({ id: 'contacts.invitation.rejectFailed' }));
    }
  };

  const renderReceivedItem = (inv: GroupInvitationVo) => (
    <div key={inv.id} className={styles.invitationItem}>
      <div className={styles.invitationLeft}>
        <div className={`${styles.invitationAvatar} ${styles.avatarReceived}`}>
          <UserSwitchOutlined />
        </div>
      </div>
      <div className={styles.invitationInfo}>
        <div className={styles.invitationGroup}>{inv.group_name}</div>
        <div className={styles.invitationMeta}>
          <span>
            <TeamOutlined style={{ marginRight: 4, fontSize: 11 }} />
            {inv.inviter_uuid.slice(0, 8)}...
          </span>
          <span>{formatTime(inv.created_at)}</span>
        </div>
      </div>
      <div className={styles.invitationActions}>
        {inv.status === 1 ? (
          <>
            <Button
              type="primary"
              size="small"
              onClick={() => handleAccept(inv.group_uuid)}
            >
              {intl.formatMessage({ id: 'contacts.invitation.accept' })}
            </Button>
            <Button
              size="small"
              danger
              onClick={() => handleDecline(inv.group_uuid)}
            >
              {intl.formatMessage({ id: 'contacts.invitation.reject' })}
            </Button>
          </>
        ) : (
          <Tag color={getStatusConfig(inv.status).color}>
            {getStatusConfig(inv.status).text}
          </Tag>
        )}
      </div>
    </div>
  );

  const renderSentItem = (inv: GroupInvitationVo) => (
    <div key={inv.id} className={styles.invitationItem}>
      <div className={styles.invitationLeft}>
        <div className={`${styles.invitationAvatar} ${styles.avatarSent}`}>
          <TeamOutlined />
        </div>
      </div>
      <div className={styles.invitationInfo}>
        <div className={styles.invitationGroup}>{inv.group_name}</div>
        <div className={styles.invitationMeta}>
          <span>
            <UserSwitchOutlined style={{ marginRight: 4, fontSize: 11 }} />
            {inv.invitee_uuid.slice(0, 8)}...
          </span>
          <span>{formatTime(inv.created_at)}</span>
        </div>
      </div>
      <div className={styles.invitationActions}>
        <Tag color={getStatusConfig(inv.status).color}>
          {getStatusConfig(inv.status).text}
        </Tag>
      </div>
    </div>
  );

  const pendingCount = receivedList.filter((i) => i.status === 1).length;

  const tabItems = [
    {
      key: 'received',
      label: (
        <span className={styles.tabLabel}>
          <span>{intl.formatMessage({ id: 'contacts.invitation.tabReceived' })}</span>
          {pendingCount > 0 && <span className={styles.badge}>{pendingCount > 99 ? '99+' : pendingCount}</span>}
        </span>
      ),
      children: receivedList.length > 0 ? (
        <div className={styles.invitationList}>
          {receivedList.map(renderReceivedItem)}
        </div>
      ) : (
        <Empty description={intl.formatMessage({ id: 'contacts.invitation.noReceived' })} />
      ),
    },
    {
      key: 'sent',
      label: intl.formatMessage({ id: 'contacts.invitation.tabSent' }),
      children: sentList.length > 0 ? (
        <div className={styles.invitationList}>
          {sentList.map(renderSentItem)}
        </div>
      ) : (
        <Empty description={intl.formatMessage({ id: 'contacts.invitation.noSent' })} />
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{intl.formatMessage({ id: 'contacts.invitation.modalTitle' })}</span>
          <Popconfirm
            title={intl.formatMessage({ id: 'contacts.invitation.clearUnreadConfirm' })}
            onConfirm={handleClearUnread}
            okText={intl.formatMessage({ id: 'contacts.invitation.confirm' })}
            cancelText={intl.formatMessage({ id: 'contacts.invitation.cancel' })}
          >
            <Button type="text" size="small" icon={<ClearOutlined />}>
              {intl.formatMessage({ id: 'contacts.invitation.clearUnread' })}
            </Button>
          </Popconfirm>
        </div>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={520}
    >
      <Tabs items={tabItems} />
    </Modal>
  );
};

export default InvitationManager;
