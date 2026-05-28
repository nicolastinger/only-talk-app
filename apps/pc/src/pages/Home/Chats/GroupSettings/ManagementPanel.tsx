import { useBearStore } from '@/store/store';
import { get_friend_list, invite_group_members, quit_group, dissolve_group, set_member_role } from '@workspace/services';
import { FriendVo, GroupMemberVo, GroupVo } from '@workspace/types';
import { Button, Modal, Select, message } from 'antd';
import { history } from '@umijs/max';
import { useState } from 'react';
import styles from './index.module.less';

interface Props {
  groupInfo: GroupVo;
  members: GroupMemberVo[];
  onUpdate: () => void;
}

const ManagementPanel: React.FC<Props> = ({ groupInfo, members, onUpdate }) => {
  const { userInfo } = useBearStore();
  const isOwner = groupInfo.owner_uuid === userInfo?.uuid;

  const handleLeaveGroup = () => {
    Modal.confirm({
      title: '退出群聊',
      content: '确定要退出该群聊吗？',
      okText: '确定',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await quit_group(groupInfo.group_uuid);
          message.success('已退出群聊');
          history.push('/home/chats/dashboard');
        } catch {
          message.error('退出群聊失败');
        }
      },
    });
  };

  const handleDissolve = () => {
    Modal.confirm({
      title: '解散群聊',
      content: `确定要解散"${groupInfo.group_name}"吗？此操作不可恢复。`,
      okText: '确定解散',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await dissolve_group(groupInfo.group_uuid);
          message.success('群聊已解散');
          history.push('/home/chats/dashboard');
        } catch {
          message.error('解散群聊失败');
        }
      },
    });
  };

  const handleTransferOwnership = async () => {
    const membersToTransfer = members.filter((m) => m.user_id !== userInfo?.uuid);
    if (membersToTransfer.length === 0) {
      message.warning('群内没有其他成员可转让');
      return;
    }

    let selectedUser: string | null = null;

    Modal.confirm({
      title: '转让群主',
      content: (
        <div>
          <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
            选择要转让群主的成员：
          </div>
          <Select
            style={{ width: '100%' }}
            placeholder="选择成员"
            onChange={(val) => {
              selectedUser = val;
            }}
            options={membersToTransfer.map((m) => ({
              label: `${m.nickname || m.user_id} (${m.user_id})`,
              value: m.user_id,
            }))}
          />
        </div>
      ),
      okText: '转让',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!selectedUser) {
          message.warning('请选择要转让的成员');
          return Promise.reject();
        }
        try {
          await set_member_role({
            group_uuid: groupInfo.group_uuid,
            user_uuid: selectedUser,
            role: 2,
          });
          message.success('群主已转让');
          onUpdate();
        } catch {
          message.error('转让失败');
          return Promise.reject();
        }
      },
    });
  };

  return (
    <div>
      {!isOwner && (
        <div className={styles.dangerZone} style={{ borderColor: 'var(--color-warning-bg, #fffbe6)', borderStyle: 'solid', borderWidth: 1 }}>
          <div className={styles.dangerItem}>
            <Button danger block onClick={handleLeaveGroup}>
              退出群聊
            </Button>
            <div className={styles.dangerDesc}>退出后将不再收到该群消息</div>
          </div>
        </div>
      )}

      {isOwner && (
        <>
          <div className={styles.dangerZone}>
            <div className={styles.dangerTitle}>群主操作</div>
            <div className={styles.dangerItem}>
              <Button block onClick={handleTransferOwnership}>
                转让群主
              </Button>
              <div className={styles.dangerDesc}>将群主身份转让给其他成员，自己将降为管理员</div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div className={styles.dangerZone}>
              <div className={styles.dangerTitle}>危险操作</div>
              <div className={styles.dangerItem}>
                <Button danger block onClick={handleDissolve}>
                  解散群聊
                </Button>
                <div className={styles.dangerDesc}>解散后所有群成员将被移出，群消息记录将被清空</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ManagementPanel;
