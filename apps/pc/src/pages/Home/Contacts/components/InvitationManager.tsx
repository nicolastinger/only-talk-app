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
import { ClearOutlined } from '@ant-design/icons';
import { useBearStore } from '@/store/store';
import { useEffect, useState } from 'react';
import styles from './styles/InvitationManager.less';

interface InvitationManagerProps {
  visible: boolean;
  onCancel: () => void;
}

const INVITATION_STATUS_MAP: Record<number, { text: string; color: string }> = {
  1: { text: '待处理', color: 'processing' },
  2: { text: '已接受', color: 'success' },
  3: { text: '已拒绝', color: 'error' },
};

const formatTime = (timestamp: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const InvitationManager: React.FC<InvitationManagerProps> = ({
  visible,
  onCancel,
}) => {
  const [receivedList, setReceivedList] = useState<GroupInvitationVo[]>([]);
  const [sentList, setSentList] = useState<GroupInvitationVo[]>([]);
  const setMenuUnread = useBearStore((state) => state.setMenuUnread);

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
      message.error('获取邀请列表失败');
    }
  };

  const handleClearUnread = async () => {
    await clearUnreadByLevel(1, 3, -1, -1);
    refreshUnreadCounts();
    message.success('已清空群组邀请未读');
  };

  const handleAccept = async (groupUuid: string) => {
    try {
      const ok = await accept_group_invitation(groupUuid);
      if (ok) {
        message.success('已接受邀请');
        loadAll();
      } else {
        message.warning('接受邀请失败');
      }
    } catch (err) {
      message.error('接受邀请失败');
    }
  };

  const handleDecline = async (groupUuid: string) => {
    try {
      const ok = await decline_group_invitation(groupUuid);
      if (ok) {
        message.success('已拒绝邀请');
        loadAll();
      } else {
        message.warning('拒绝邀请失败');
      }
    } catch (err) {
      message.error('拒绝邀请失败');
    }
  };

  const renderReceivedItem = (inv: GroupInvitationVo) => (
    <div key={inv.id} className={styles.invitationItem}>
      <div className={styles.invitationInfo}>
        <div className={styles.invitationGroup}>{inv.group_name}</div>
        <div className={styles.invitationMeta}>
          <span>邀请人: {inv.inviter_uuid.slice(0, 8)}...</span>
          <span style={{ marginLeft: 12 }}>{formatTime(inv.created_at)}</span>
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
              接受
            </Button>
            <Button
              size="small"
              danger
              onClick={() => handleDecline(inv.group_uuid)}
              style={{ marginLeft: 8 }}
            >
              拒绝
            </Button>
          </>
        ) : (
          <Tag color={INVITATION_STATUS_MAP[inv.status]?.color}>
            {INVITATION_STATUS_MAP[inv.status]?.text || '未知'}
          </Tag>
        )}
      </div>
    </div>
  );

  const renderSentItem = (inv: GroupInvitationVo) => (
    <div key={inv.id} className={styles.invitationItem}>
      <div className={styles.invitationInfo}>
        <div className={styles.invitationGroup}>{inv.group_name}</div>
        <div className={styles.invitationMeta}>
          <span>被邀请人: {inv.invitee_uuid.slice(0, 8)}...</span>
          <span style={{ marginLeft: 12 }}>{formatTime(inv.created_at)}</span>
        </div>
      </div>
      <div className={styles.invitationActions}>
        <Tag color={INVITATION_STATUS_MAP[inv.status]?.color}>
          {INVITATION_STATUS_MAP[inv.status]?.text || '未知'}
        </Tag>
      </div>
    </div>
  );

  const pendingCount = receivedList.filter((i) => i.status === 1).length;

  const tabItems = [
    {
      key: 'received',
      label: `邀请我的${pendingCount > 0 ? ` (${pendingCount})` : ''}`,
      children: receivedList.length > 0 ? (
        <div className={styles.invitationList}>
          {receivedList.map(renderReceivedItem)}
        </div>
      ) : (
        <Empty description="暂无收到的邀请" />
      ),
    },
    {
      key: 'sent',
      label: '我邀请的',
      children: sentList.length > 0 ? (
        <div className={styles.invitationList}>
          {sentList.map(renderSentItem)}
        </div>
      ) : (
        <Empty description="暂无发出的邀请" />
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>群聊邀请管理</span>
          <Popconfirm
            title="确定清空所有群组邀请未读通知？"
            onConfirm={handleClearUnread}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" size="small" icon={<ClearOutlined />}>
              清空未读
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
