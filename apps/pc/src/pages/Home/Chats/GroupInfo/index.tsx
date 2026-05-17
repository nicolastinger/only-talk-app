import { useBearStore } from '@/store/store';
import { history, useLocation } from '@umijs/max';
import { GroupMemberVo, GroupVo } from '@workspace/types';
import { Avatar, Button, List, Modal, Spin, Typography, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import React, { useEffect, useState } from 'react';

const GroupInfoPage: React.FC = () => {
  const [groupInfo, setGroupInfo] = useState<GroupVo | null>(null);
  const [members, setMembers] = useState<GroupMemberVo[]>([]);
  const [loading, setLoading] = useState(true);

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

  const isOwner = groupInfo?.owner_id === meUuid;

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
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button type="primary" onClick={handleStartChat}>
              进入群聊
            </Button>
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
          renderItem={(member: GroupMemberVo) => (
            <List.Item>
              <List.Item.Meta
                avatar={<Avatar size={32} icon={<UserOutlined />} />}
                title={
                  <span>
                    {member.nickname || member.user_id}
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
          )}
        />
      )}
    </div>
  );
};

export default GroupInfoPage;
