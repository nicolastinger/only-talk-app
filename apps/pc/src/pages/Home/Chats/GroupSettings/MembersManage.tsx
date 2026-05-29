import { useBearStore } from '@/store/store';
import { invite_group_members, remove_group_member, set_member_role } from '@workspace/services';
import { FriendVo, GroupMemberVo, GroupVo } from '@workspace/types';
import { Avatar, Button, Dropdown, Input, List, MenuProps, Modal, Select, Space, message, Tag } from 'antd';
import { UserOutlined, PlusOutlined, MoreOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import styles from './index.module.less';

interface Props {
  groupInfo: GroupVo;
  members: GroupMemberVo[];
  onUpdate: () => void;
}

const ROLE_TEXT: Record<number, string> = { 2: '群主', 1: '管理员', 0: '成员' };

const MembersManage: React.FC<Props> = ({ groupInfo, members, onUpdate }) => {
  const { userInfo } = useBearStore();
  const [searchText, setSearchText] = useState('');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [friendList, setFriendList] = useState<FriendVo[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  const isOwner = groupInfo.owner_uuid === userInfo?.uuid;
  const isAdmin = members.some((m) => m.user_id === userInfo?.uuid && m.role >= 1);
  const canManage = isOwner || isAdmin;

  useEffect(() => {
    if (inviteModalOpen) {
      loadFriends();
    }
  }, [inviteModalOpen]);

  const loadFriends = async () => {
    try {
      const friends: FriendVo[] = await invoke('get_friend_list');
      const memberIds = new Set(members.map((m) => m.user_id));
      setFriendList(friends.filter((f) => !memberIds.has(f.friend_id)));
      setSelectedFriends([]);
    } catch {
      message.error('获取好友列表失败');
    }
  };

  const handleInvite = async () => {
    if (selectedFriends.length === 0) {
      message.warning('请选择要邀请的好友');
      return;
    }
    setInviteLoading(true);
    try {
      const invited = await invite_group_members(groupInfo.group_uuid, selectedFriends);
      message.success(`已向 ${invited.length} 位好友发送群邀请`);
      setInviteModalOpen(false);
      onUpdate();
    } catch {
      message.error('邀请失败');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleKick = (member: GroupMemberVo) => {
    Modal.confirm({
      title: '移出群聊',
      content: `确定要将 "${member.nickname || member.user_id}" 移出群聊吗？`,
      okText: '确定',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await remove_group_member(groupInfo.group_uuid, member.user_id);
          message.success('已移出群聊');
          onUpdate();
        } catch {
          message.error('移出群聊失败');
        }
      },
    });
  };

  const handleSetRole = async (member: GroupMemberVo, role: number) => {
    try {
      await set_member_role({
        group_uuid: groupInfo.group_uuid,
        user_uuid: member.user_id,
        role,
      });
      message.success(role === 1 ? '已设为管理员' : '已取消管理员');
      onUpdate();
    } catch {
      message.error('设置失败');
    }
  };

  const getMemberActions = (member: GroupMemberVo): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    const isSelf = member.user_id === userInfo?.uuid;

    if (isSelf) {
      return [];
    }

    if (isOwner) {
      if (member.role === 0) {
        items.push({
          key: 'admin',
          label: '设为管理员',
          onClick: () => handleSetRole(member, 1),
        });
      }
      if (member.role === 1) {
        items.push({
          key: 'member',
          label: '取消管理员',
          onClick: () => handleSetRole(member, 0),
        });
      }
      items.push({
        key: 'kick',
        label: <span style={{ color: 'var(--color-error)' }}>移出群聊</span>,
        onClick: () => handleKick(member),
      });
    } else if (isAdmin && member.role === 0) {
      items.push({
        key: 'kick',
        label: <span style={{ color: 'var(--color-error)' }}>移出群聊</span>,
        onClick: () => handleKick(member),
      });
    }

    return items.length > 0 ? items : [];
  };

  const filteredMembers = members.filter((m) => {
    const keyword = searchText.toLowerCase();
    return (
      (m.nickname || '').toLowerCase().includes(keyword) ||
      (m.username || '').toLowerCase().includes(keyword) ||
      m.user_id.toLowerCase().includes(keyword)
    );
  });

  return (
    <div>
      <div className={styles.memberListHeader}>
        <span>共 {members.length} 位成员</span>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteModalOpen(true)}>
            邀请成员
          </Button>
        )}
      </div>

      <Input.Search
        placeholder="搜索成员"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 16 }}
        allowClear
      />

      <List
        dataSource={filteredMembers}
        renderItem={(member) => (
          <div className={styles.memberItem}>
            <div className={styles.memberInfo}>
              <Avatar size={32} icon={<UserOutlined />} src={member.icon} />
              <div>
                <div>
                  <span className={styles.memberName}>
                    {member.nickname || member.username}
                  </span>
                  {member.role > 0 && (
                    <span className={`${styles.roleTag} ${member.role === 2 ? styles.roleOwner : styles.roleAdmin}`}>
                      {ROLE_TEXT[member.role]}
                    </span>
                  )}
                  {member.user_id === userInfo?.uuid && (
                    <Tag style={{ marginLeft: 4 }} color="blue">我</Tag>
                  )}
                </div>
                <span className={styles.memberId}>{member.user_id}</span>
              </div>
            </div>
            {getMemberActions(member).length > 0 && (
              <Dropdown menu={{ items: getMemberActions(member) }} placement="bottomRight" trigger={['click']}>
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            )}
          </div>
        )}
      />

      <Modal
        title="邀请成员"
        open={inviteModalOpen}
        onOk={handleInvite}
        onCancel={() => setInviteModalOpen(false)}
        confirmLoading={inviteLoading}
        okText="邀请"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          选择要邀请入群的好友，被邀请方将收到通知并可选择接受或拒绝。
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择好友"
          value={selectedFriends}
          onChange={setSelectedFriends}
          options={friendList.map((f) => ({
            label: f.friend_name || f.friend_id,
            value: f.friend_id,
          }))}
        />
      </Modal>
    </div>
  );
};

export default MembersManage;
