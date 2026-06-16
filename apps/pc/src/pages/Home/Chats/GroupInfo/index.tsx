import { useBearStore } from '@/store/store';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { history, useIntl, useLocation } from '@umijs/max';
import { FriendVo, GroupMemberVo, GroupVo } from '@workspace/types';
import { get_friend_list, invite_group_members } from '@workspace/services';
import { Avatar, Button, List, Modal, Select, Spin, Typography, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import React, { useEffect, useMemo, useState } from 'react';

const GroupInfoPage: React.FC = () => {
  const intl = useIntl();
  const [groupInfo, setGroupInfo] = useState<GroupVo | null>(null);
  const [members, setMembers] = useState<GroupMemberVo[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [friendList, setFriendList] = useState<FriendVo[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const groupId = params.get('groupId') || '';
  const meUuid = useBearStore((state) => state.userInfo.uuid) || '';

  useEffect(() => {
    loadGroupInfo();
    loadMembers();
  }, [groupId]);

  const loadGroupInfo = async () => {
    try {
      const data: GroupVo = await invoke('get_group_info_command', {
        groupId,
      });
      setGroupInfo(data);
    } catch (err) {
      console.log('获取群信息失败', err);
    }
  };

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data: GroupMemberVo[] = await invoke('sync_group_members_command', {
        groupId,
      });
      setMembers(data);
    } catch (err) {
      console.log('获取成员失败，尝试本地加载', err);
      try {
        const data: GroupMemberVo[] = await invoke('get_group_members', {
          groupId,
        });
        setMembers(data);
      } catch (e) {
        console.log('本地获取成员也失败', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGroup = () => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'groupSettings.leaveGroup' }),
      content: intl.formatMessage({ id: 'groupSettings.leaveGroupConfirm' }),
      okText: intl.formatMessage({ id: 'groupSettings.members.confirm' }),
      cancelText: intl.formatMessage({ id: 'groupSettings.members.cancel' }),
      onOk: async () => {
        try {
          await invoke('leave_group_command', { groupId });
          message.success(intl.formatMessage({ id: 'groupSettings.leaveGroupSuccess' }));
          history.push('/home/chats/dashboard');
        } catch (e) {
          message.error(intl.formatMessage({ id: 'groupSettings.leaveGroupFailed' }));
        }
      },
    });
  };

  const handleStartChat = async () => {
    try {
      await invoke('create_group_chat_session_command', { groupId });
      history.push(`/home/chats/group-chat?groupId=${groupId}`);
    } catch (e) {
      console.log('创建群聊会话失败', e);
    }
  };

  const openInviteModal = async () => {
    try {
      const friends = await get_friend_list();
      const memberIds = new Set(members.map((m) => m.user_uuid));
      const nonMembers = friends.filter((f) => !memberIds.has(f.friend_id));
      setFriendList(nonMembers);
      setSelectedFriends([]);
      setInviteModalOpen(true);
    } catch (err) {
      console.log('获取好友列表失败', err);
    }
  };

  const handleInvite = async () => {
    if (selectedFriends.length === 0) {
      message.warning(intl.formatMessage({ id: 'groupSettings.members.selectFriendsToInvite' }));
      return;
    }
    setInviteLoading(true);
    try {
      const invited = await invite_group_members(groupId, selectedFriends);
      message.success(intl.formatMessage({ id: 'groupSettings.members.inviteSent' }, { count: invited.length }));
      setInviteModalOpen(false);
      loadMembers();
    } catch (err) {
      message.error(intl.formatMessage({ id: 'groupSettings.members.inviteFailed' }));
    } finally {
      setInviteLoading(false);
    }
  };

  const isOwner = groupInfo?.owner_uuid === meUuid;
  const isAdmin = members.some((m) => m.user_uuid === meUuid && m.role >= 1);

  const memberUuids = useMemo(
    () => members.map((m) => m.user_uuid).filter(Boolean),
    [members],
  );
  const { memberInfoMap } = useGroupMemberInfo(memberUuids);

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      {groupInfo && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar size={64} icon={<UserOutlined />} />
          <Typography.Title level={4} style={{ marginTop: 12 }}>
            {groupInfo.group_name}
          </Typography.Title>
          <Typography.Text type="secondary">
            {intl.formatMessage({ id: 'groupInfo.memberCount' }, { count: groupInfo.member_count })}
          </Typography.Text>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button type="primary" onClick={handleStartChat}>
              {intl.formatMessage({ id: 'groupInfo.enterGroupChat' })}
            </Button>
            {(isOwner || isAdmin) && (
              <Button onClick={openInviteModal}>
                {intl.formatMessage({ id: 'groupSettings.members.inviteMember' })}
              </Button>
            )}
            {(isOwner || isAdmin) && (
              <Button onClick={() => history.push(`/home/chats/group-settings?groupId=${groupId}`)}>
                {intl.formatMessage({ id: 'groupSettings.title' })}
              </Button>
            )}
            {!isOwner && (
              <Button danger onClick={handleLeaveGroup}>
                {intl.formatMessage({ id: 'groupSettings.leaveGroup' })}
              </Button>
            )}
          </div>
        </div>
      )}

      <Typography.Title level={5}>{intl.formatMessage({ id: 'groupSettings.groupMembers' })} ({members.length})</Typography.Title>
      {loading ? (
        <Spin />
      ) : (
        <List
          dataSource={members}
          renderItem={(member: GroupMemberVo) => {
            const info = memberInfoMap.get(member.user_uuid);
            const displayName = info?.username || member.nickname || member.user_uuid;
            return (
            <List.Item>
              <List.Item.Meta
                avatar={<Avatar size={32} icon={<UserOutlined />} src={info?.icon || member.icon} />}
                title={
                  <span>
                    {displayName}
                    {member.role === 2 && (
                      <span style={{ color: '#faad14', fontSize: 12, marginLeft: 8 }}>
                        {intl.formatMessage({ id: 'groupSettings.members.owner' })}
                      </span>
                    )}
                    {member.role === 1 && (
                      <span style={{ color: '#4096ff', fontSize: 12, marginLeft: 8 }}>
                        {intl.formatMessage({ id: 'groupSettings.members.admin' })}
                      </span>
                    )}
                  </span>
                }
                description={member.user_uuid === meUuid ? intl.formatMessage({ id: 'groupSettings.members.me' }) : member.user_uuid}
              />
            </List.Item>
            );
          }}
        />
      )}

      <Modal
        title={intl.formatMessage({ id: 'groupSettings.members.inviteMember' })}
        open={inviteModalOpen}
        onOk={handleInvite}
        onCancel={() => setInviteModalOpen(false)}
        confirmLoading={inviteLoading}
        okText={intl.formatMessage({ id: 'groupSettings.members.invite' })}
        cancelText={intl.formatMessage({ id: 'groupSettings.members.cancel' })}
      >
        <div style={{ marginBottom: 12, color: '#666' }}>
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

export default GroupInfoPage;
