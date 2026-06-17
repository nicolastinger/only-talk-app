import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { invite_group_members, remove_group_member, set_member_role } from '@workspace/services';
import { FriendVo, GroupMemberVo, GroupVo } from '@workspace/types';
import { Avatar, Button, Dropdown, Input, List, MenuProps, Modal, Select, Space, message, Tag } from 'antd';
import { UserOutlined, PlusOutlined, MoreOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from '@umijs/max';
import styles from './index.module.less';

interface Props {
  groupInfo: GroupVo;
  members: GroupMemberVo[];
  onUpdate: () => void;
}

const MembersManage: React.FC<Props> = ({ groupInfo, members, onUpdate }) => {
  const intl = useIntl();
  const { userInfo } = useBearStore();

  const ROLE_TEXT: Record<number, string> = {
    2: intl.formatMessage({ id: 'groupSettings.members.owner' }),
    1: intl.formatMessage({ id: 'groupSettings.members.admin' }),
    0: intl.formatMessage({ id: 'groupSettings.members.member' })
  };
  const [searchText, setSearchText] = useState('');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [friendList, setFriendList] = useState<FriendVo[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  const isOwner = groupInfo.owner_uuid === userInfo?.uuid;
  const isAdmin = members.some((m) => m.user_uuid === userInfo?.uuid && m.role >= 1);
  const canManage = isOwner || isAdmin;

  const memberUuids = useMemo(
    () => members.map((m) => m.user_uuid).filter(Boolean),
    [members],
  );
  const { memberInfoMap } = useGroupMemberInfo(memberUuids);

  // 收集所有成员的 icon bizId，批量转换为可用的头像 URL
  const memberIconBizIds = useMemo(() => {
    const ids: string[] = [];
    for (const member of members) {
      const info = memberInfoMap.get(member.user_uuid);
      const bizId = info?.icon || member.icon;
      if (bizId) ids.push(bizId);
    }
    return ids;
  }, [members, memberInfoMap]);
  const { avatarMap } = useAvatarMap(memberIconBizIds);

  useEffect(() => {
    if (inviteModalOpen) {
      loadFriends();
    }
  }, [inviteModalOpen]);

  const loadFriends = async () => {
    try {
      const friends: FriendVo[] = await invoke('get_friend_list');
      const memberIds = new Set(members.map((m) => m.user_uuid));
      setFriendList(friends.filter((f) => !memberIds.has(f.friend_id)));
      setSelectedFriends([]);
    } catch {
      message.error(intl.formatMessage({ id: 'groupSettings.members.getFriendListFailed' }));
    }
  };

  const handleInvite = async () => {
    if (selectedFriends.length === 0) {
      message.warning(intl.formatMessage({ id: 'groupSettings.members.selectFriendsToInvite' }));
      return;
    }
    setInviteLoading(true);
    try {
      const invited = await invite_group_members(groupInfo.group_uuid, selectedFriends);
      message.success(intl.formatMessage({ id: 'groupSettings.members.inviteSent' }, { count: invited.length }));
      setInviteModalOpen(false);
      onUpdate();
    } catch {
      message.error(intl.formatMessage({ id: 'groupSettings.members.inviteFailed' }));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleKick = (member: GroupMemberVo) => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'groupSettings.members.removeMember' }),
      content: intl.formatMessage({ id: 'groupSettings.members.removeMemberConfirm' }, { name: member.username || member.user_uuid }),
      okText: intl.formatMessage({ id: 'groupSettings.members.confirm' }),
      okButtonProps: { danger: true },
      cancelText: intl.formatMessage({ id: 'groupSettings.members.cancel' }),
      onOk: async () => {
        try {
          await remove_group_member(groupInfo.group_uuid, member.user_uuid);
          message.success(intl.formatMessage({ id: 'groupSettings.members.removeMemberSuccess' }));
          onUpdate();
        } catch {
          message.error(intl.formatMessage({ id: 'groupSettings.members.removeMemberFailed' }));
        }
      },
    });
  };

  const handleSetRole = async (member: GroupMemberVo, role: number) => {
    try {
      await set_member_role({
        group_uuid: groupInfo.group_uuid,
        user_uuid: member.user_uuid,
        role,
      });
      message.success(role === 1
        ? intl.formatMessage({ id: 'groupSettings.members.setAdminSuccess' })
        : intl.formatMessage({ id: 'groupSettings.members.removeAdminSuccess' }));
      onUpdate();
    } catch {
      message.error(intl.formatMessage({ id: 'groupSettings.members.setRoleFailed' }));
    }
  };

  const getMemberActions = (member: GroupMemberVo): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    const isSelf = member.user_uuid === userInfo?.uuid;

    if (isSelf) {
      return [];
    }

    if (isOwner) {
      if (member.role === 0) {
        items.push({
          key: 'admin',
          label: intl.formatMessage({ id: 'groupSettings.members.setAdmin' }),
          onClick: () => handleSetRole(member, 1),
        });
      }
      if (member.role === 1) {
        items.push({
          key: 'member',
          label: intl.formatMessage({ id: 'groupSettings.members.removeAdmin' }),
          onClick: () => handleSetRole(member, 0),
        });
      }
      items.push({
        key: 'kick',
        label: <span style={{ color: 'var(--color-error)' }}>{intl.formatMessage({ id: 'groupSettings.members.removeMember' })}</span>,
        onClick: () => handleKick(member),
      });
    } else if (isAdmin && member.role === 0) {
      items.push({
        key: 'kick',
        label: <span style={{ color: 'var(--color-error)' }}>{intl.formatMessage({ id: 'groupSettings.members.removeMember' })}</span>,
        onClick: () => handleKick(member),
      });
    }

    return items.length > 0 ? items : [];
  };

  const filteredMembers = members.filter((m) => {
    const keyword = searchText.toLowerCase();
    const info = memberInfoMap.get(m.user_uuid);
    return (
      (m.username || '').toLowerCase().includes(keyword) ||
      (info?.account || '').toLowerCase().includes(keyword) ||
      m.user_uuid.toLowerCase().includes(keyword)
    );
  });

  return (
    <div>
      <div className={styles.memberListHeader}>
        <span>{intl.formatMessage({ id: 'groupSettings.members.memberCount' }, { count: members.length })}</span>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteModalOpen(true)}>
            {intl.formatMessage({ id: 'groupSettings.members.inviteMember' })}
          </Button>
        )}
      </div>

      <Input.Search
        placeholder={intl.formatMessage({ id: 'groupSettings.members.searchMember' })}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 16 }}
        allowClear
      />

      <List
        dataSource={filteredMembers}
        renderItem={(member) => {
          const info = memberInfoMap.get(member.user_uuid);
          const displayName = info?.username || member.username || member.user_uuid;
          const iconBizId = info?.icon || member.icon;
          const avatarSrc = iconBizId ? avatarMap.get(iconBizId) : undefined;
          return (
          <div className={styles.memberItem}>
            <div className={styles.memberInfo}>
              <Avatar size={32} icon={<UserOutlined />} src={avatarSrc || DEFAULT_ICON} />
              <div>
                <div>
                  <span className={styles.memberName}>
                    {displayName}
                  </span>
                  {member.role > 0 && (
                    <span className={`${styles.roleTag} ${member.role === 2 ? styles.roleOwner : styles.roleAdmin}`}>
                      {ROLE_TEXT[member.role]}
                    </span>
                  )}
                  {member.user_uuid === userInfo?.uuid && (
                    <Tag style={{ marginLeft: 4 }} color="blue">{intl.formatMessage({ id: 'groupSettings.members.me' })}</Tag>
                  )}
                </div>
                <span className={styles.memberId}>{info?.account || member.user_uuid}</span>
              </div>
            </div>
            {(getMemberActions(member) || []).length > 0 && (
              <Dropdown menu={{ items: getMemberActions(member) }} placement="bottomRight" trigger={['click']}>
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            )}
          </div>
          );
        }}
      />

      <Modal
        title={intl.formatMessage({ id: 'groupSettings.members.inviteMember' })}
        open={inviteModalOpen}
        onOk={handleInvite}
        onCancel={() => setInviteModalOpen(false)}
        confirmLoading={inviteLoading}
        okText={intl.formatMessage({ id: 'groupSettings.members.invite' })}
        cancelText={intl.formatMessage({ id: 'groupSettings.members.cancel' })}
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          {intl.formatMessage({ id: 'groupSettings.members.inviteDesc' })}
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder={intl.formatMessage({ id: 'groupSettings.members.selectFriend' })}
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
