import { DEFAULT_ICON } from '@/constants';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useBearStore } from '@/store/store';
import { MessageOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { history, useIntl, useLocation } from '@umijs/max';
import {
  get_friend_list,
  getFiles,
  invite_group_members,
} from '@workspace/services';
import { FriendVo, GroupMemberStoreVo, GroupVo } from '@workspace/types';
import { Avatar, Button, List, message, Modal, Select, Spin } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import styles from './index.module.less';

const GroupInfoPage: React.FC = () => {
  const intl = useIntl();
  const [groupInfo, setGroupInfo] = useState<GroupVo | null>(null);
  const [members, setMembers] = useState<GroupMemberStoreVo[]>([]);
  const [groupIcon, setGroupIcon] = useState<string>('');
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

  const loadGroupIcon = async (avatar?: string) => {
    if (!avatar) return;
    try {
      const files = await getFiles(avatar);
      if (files?.[0]?.tauri_file_path) {
        setGroupIcon(files[0].tauri_file_path);
      }
    } catch (e) {
      console.log('获取群头像失败', e);
    }
  };

  const loadGroupInfo = async () => {
    try {
      const data: GroupVo = await invoke('get_group_info_command', {
        groupId,
      });
      setGroupInfo(data);
      loadGroupIcon(data.avatar);
    } catch (err) {
      console.log('获取群信息失败，尝试本地加载', err);
      try {
        const local: GroupVo[] = await invoke('get_group_list');
        const found = local.find((g) => g.group_uuid === groupId);
        if (found) {
          setGroupInfo(found);
          loadGroupIcon(found.avatar);
        }
      } catch (e) {
        console.log('本地获取群信息也失败', e);
      }
    }
  };

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data: GroupMemberStoreVo[] = await invoke(
        'sync_group_members_command',
        {
          groupId,
        },
      );
      setMembers(data);
    } catch (err) {
      console.log('获取成员失败，尝试本地加载', err);
      try {
        const data: GroupMemberStoreVo[] = await invoke('get_group_members', {
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
          message.success(
            intl.formatMessage({ id: 'groupSettings.leaveGroupSuccess' }),
          );
          history.push('/home/chats/dashboard');
        } catch (e) {
          message.error(
            intl.formatMessage({ id: 'groupSettings.leaveGroupFailed' }),
          );
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
      message.warning(
        intl.formatMessage({
          id: 'groupSettings.members.selectFriendsToInvite',
        }),
      );
      return;
    }
    setInviteLoading(true);
    try {
      const invited = await invite_group_members(groupId, selectedFriends);
      message.success(
        intl.formatMessage(
          { id: 'groupSettings.members.inviteSent' },
          { count: invited.length },
        ),
      );
      setInviteModalOpen(false);
      loadMembers();
    } catch (err) {
      message.error(
        intl.formatMessage({ id: 'groupSettings.members.inviteFailed' }),
      );
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
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.cover} />

        <div className={styles.header}>
          <div className={styles.avatarWrap}>
            <img
              className={styles.icon}
              src={groupIcon || DEFAULT_ICON}
              alt="group avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
          </div>
          <div className={styles.name}>{groupInfo?.group_name || '-'}</div>
          <div className={styles.metaChips}>
            <span className={styles.chip}>
              <TeamOutlined />
              {groupInfo?.member_count ?? members.length}{' '}
              {intl.formatMessage({ id: 'groupInfo.members' })}
            </span>
          </div>

          <div className={styles.actions}>
            <Button
              className={styles.primaryBtn}
              color="primary"
              variant="solid"
              icon={<MessageOutlined />}
              onClick={handleStartChat}
            >
              {intl.formatMessage({ id: 'groupInfo.enterGroupChat' })}
            </Button>
            {(isOwner || isAdmin) && (
              <Button
                color="default"
                variant="outlined"
                onClick={openInviteModal}
              >
                {intl.formatMessage({
                  id: 'groupSettings.members.inviteMember',
                })}
              </Button>
            )}
            {(isOwner || isAdmin) && (
              <Button
                color="default"
                variant="outlined"
                onClick={() =>
                  history.push(`/home/chats/group-settings?groupId=${groupId}`)
                }
              >
                {intl.formatMessage({ id: 'groupSettings.title' })}
              </Button>
            )}
            {!isOwner && (
              <Button
                danger
                color="danger"
                variant="outlined"
                onClick={handleLeaveGroup}
              >
                {intl.formatMessage({ id: 'groupSettings.leaveGroup' })}
              </Button>
            )}
          </div>
        </div>

        <div className={styles.memberSection}>
          <div className={styles.sectionTitle}>
            <TeamOutlined />
            {intl.formatMessage({ id: 'groupSettings.groupMembers' })} (
            {members.length})
          </div>
          {loading ? (
            <div className={styles.loadingState}>
              <Spin />
            </div>
          ) : (
            <List
              dataSource={members}
              renderItem={(member: GroupMemberStoreVo) => {
                const info = memberInfoMap.get(member.user_id);
                const displayName =
                  info?.username || member.nickname || member.user_id;
                return (
                  <List.Item className={styles.memberItem}>
                    <div className={styles.memberInfo}>
                      <Avatar
                        size={36}
                        icon={<UserOutlined />}
                        src={info?.icon || member.icon}
                      />
                      <div className={styles.memberDetail}>
                        <span className={styles.memberName}>{displayName}</span>
                        <span className={styles.memberSub}>
                          {member.user_id === meUuid
                            ? intl.formatMessage({
                                id: 'groupSettings.members.me',
                              })
                            : member.user_id}
                        </span>
                      </div>
                      {member.role === 2 && (
                        <span
                          className={`${styles.roleTag} ${styles.ownerTag}`}
                        >
                          {intl.formatMessage({
                            id: 'groupSettings.members.owner',
                          })}
                        </span>
                      )}
                      {member.role === 1 && (
                        <span
                          className={`${styles.roleTag} ${styles.adminTag}`}
                        >
                          {intl.formatMessage({
                            id: 'groupSettings.members.admin',
                          })}
                        </span>
                      )}
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </div>

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
          placeholder={intl.formatMessage({
            id: 'groupSettings.members.selectFriend',
          })}
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
