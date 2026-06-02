import { useBearStore } from '@/store/store';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { history, useLocation } from '@umijs/max';
import { FriendVo, GroupMemberVo, GroupVo } from '@workspace/types';
import { get_friend_list, invite_group_members } from '@workspace/services';
import { Avatar, Button, List, Modal, Select, Spin, Typography, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import React, { useEffect, useMemo, useState } from 'react';

const GroupInfoPage: React.FC = () => {
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
      title: '退出群聊',
      content: '确定要退出该群聊吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await invoke('leave_group_command', { groupId });
          message.success('已退出群聊');
          history.push('/home/chats/dashboard');
        } catch (e) {
          message.error('退出群聊失败');
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
      const memberIds = new Set(members.map((m) => m.user_id));
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
      message.warning('请选择要邀请的好友');
      return;
    }
    setInviteLoading(true);
    try {
      const invited = await invite_group_members(groupId, selectedFriends);
      message.success(`已向 ${invited.length} 位好友发送群邀请`);
      setInviteModalOpen(false);
      loadMembers();
    } catch (err) {
      message.error('邀请失败');
    } finally {
      setInviteLoading(false);
    }
  };

  const isOwner = groupInfo?.owner_uuid === meUuid;
  const isAdmin = members.some((m) => m.user_id === meUuid && m.role >= 1);

  const memberUuids = useMemo(
    () => members.map((m) => m.user_id).filter(Boolean),
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
            {groupInfo.member_count} 位成员
          </Typography.Text>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button type="primary" onClick={handleStartChat}>
              进入群聊
            </Button>
            {(isOwner || isAdmin) && (
              <Button onClick={openInviteModal}>
                邀请成员
              </Button>
            )}
            {(isOwner || isAdmin) && (
              <Button onClick={() => history.push(`/home/chats/group-settings?groupId=${groupId}`)}>
                群设置
              </Button>
            )}
            {!isOwner && (
              <Button danger onClick={handleLeaveGroup}>
                退出群聊
              </Button>
            )}
          </div>
        </div>
      )}

      <Typography.Title level={5}>群成员 ({members.length})</Typography.Title>
      {loading ? (
        <Spin />
      ) : (
        <List
          dataSource={members}
          renderItem={(member: GroupMemberVo) => {
            const info = memberInfoMap.get(member.user_id);
            const displayName = info?.username || member.nickname || member.user_id;
            return (
            <List.Item>
              <List.Item.Meta
                avatar={<Avatar size={32} icon={<UserOutlined />} src={info?.icon || member.icon} />}
                title={
                  <span>
                    {displayName}
                    {member.role === 2 && (
                      <span style={{ color: '#faad14', fontSize: 12, marginLeft: 8 }}>
                        群主
                      </span>
                    )}
                    {member.role === 1 && (
                      <span style={{ color: '#4096ff', fontSize: 12, marginLeft: 8 }}>
                        管理员
                      </span>
                    )}
                  </span>
                }
                description={member.user_id === meUuid ? '我' : member.user_id}
              />
            </List.Item>
            );
          }}
        />
      )}

      <Modal
        title="邀请成员"
        open={inviteModalOpen}
        onOk={handleInvite}
        onCancel={() => setInviteModalOpen(false)}
        confirmLoading={inviteLoading}
        okText="邀请"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12, color: '#666' }}>
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

export default GroupInfoPage;
