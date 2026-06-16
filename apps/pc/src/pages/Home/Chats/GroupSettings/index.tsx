import { DEFAULT_ICON, TALK_API } from '@/constants';
import { useUserInfoList } from '@/hooks/useUserInfoList';
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { useBearStore } from '@/store/store';
import { GroupMemberVo, GroupVo } from '@workspace/types';
import { get_group_info, get_group_members, update_group, quit_group, dissolve_group, get_friend_list, invite_group_members, remove_group_member, set_member_role } from '@workspace/services';
import { convertPathToTauriUrl, getFiles, selectFile } from '@workspace/services';
import { history, useSearchParams, useIntl } from '@umijs/max';
import { Avatar, Button, Input, Modal, Select, Tag, message, Spin } from 'antd';
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CopyOutlined,
  EditOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './index.module.less';
import { FriendVo } from '@workspace/types';

const GroupSettingsPage = () => {
  const intl = useIntl();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') || '';
  const { userInfo } = useBearStore();

  const ROLE_TEXT: Record<number, string> = {
    2: intl.formatMessage({ id: 'groupSettings.members.owner' }),
    1: intl.formatMessage({ id: 'groupSettings.members.admin' }),
    0: intl.formatMessage({ id: 'groupSettings.members.member' }),
  };

  const [groupInfo, setGroupInfo] = useState<GroupVo | null>(null);
  const [members, setMembers] = useState<GroupMemberVo[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Basic settings state
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Members state
  const [searchText, setSearchText] = useState('');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [friendList, setFriendList] = useState<FriendVo[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (groupId) {
      loadData();
    }
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [info, memberList] = await Promise.allSettled([
        get_group_info(groupId),
        get_group_members(groupId),
      ]);
      if (info.status === 'fulfilled') {
        setGroupInfo(info.value);
        setGroupName(info.value.group_name);
        setGroupDesc(info.value.description || '');
        if (info.value.avatar) {
          const files = await getFiles(info.value.avatar);
          setAvatarUrl(files?.[0]?.tauri_file_path || null);
        } else {
          setAvatarUrl(null);
        }
      }
      if (memberList.status === 'fulfilled') {
        setMembers(memberList.value || []);
      }
    } catch (error) {
      console.error(intl.formatMessage({ id: 'groupSettings.loadFailed' }), error);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarClick = async () => {
    if (!canManage || avatarUploading) return;
    try {
      const files = await selectFile(false);
      if (!files || files.length === 0) return;

      const filePath = files[0];
      setAvatarUploading(true);

      const compressedResult = await invoke<string>('compress_image_to_webp_command', {
        inputPath: filePath,
      });

      const preview = convertPathToTauriUrl(compressedResult);
      if (preview) {
        setAvatarUrl(preview);
      }

      const uploadResult = await invoke<{ status: number; body: string }>('upload_file_request', {
        url: `${TALK_API}/file_integrated/upload/group_avatar/${groupInfo!.group_uuid}`,
        filePath: compressedResult,
        fieldName: 'file',
      });

      if (uploadResult.status === 200) {
        const responseBody = JSON.parse(uploadResult.body);
        if (responseBody.code === 200 && responseBody.data) {
          const bizId = responseBody.data;
          const FileVos = await getFiles(bizId);
          const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

          if (tauriFilePath) {
            setGroupInfo({ ...groupInfo!, avatar: bizId });
            setAvatarUrl(tauriFilePath);
            message.success(intl.formatMessage({ id: 'groupSettings.avatar.updateSuccess' }));
          } else {
            message.error(intl.formatMessage({ id: 'groupSettings.avatar.getFileFailed' }));
          }
        } else {
          message.error(responseBody.msg || intl.formatMessage({ id: 'groupSettings.avatar.uploadFailed' }));
        }
      } else {
        message.error(intl.formatMessage({ id: 'groupSettings.avatar.uploadFailed' }));
      }
    } catch (error: any) {
      console.error(intl.formatMessage({ id: 'groupSettings.avatar.updateFailed' }), error);
      message.error(error.message || intl.formatMessage({ id: 'groupSettings.avatar.updateFailed' }));
    } finally {
      setAvatarUploading(false);
    }
  };

  const isOwner = groupInfo?.owner_uuid === userInfo?.uuid;
  const isAdmin = members.some((m) => m.user_uuid === userInfo?.uuid && m.role >= 1);
  const canManage = isOwner || isAdmin;

  const memberUuids = useMemo(
    () => members.map((m) => m.user_uuid).filter(Boolean),
    [members],
  );
  const { userInfoMap: memberInfoMap, loading: memberInfoLoading } = useUserInfoList(memberUuids);

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

  const filteredMembers = members.filter((m) => {
    const keyword = searchText.toLowerCase();
    const info = memberInfoMap.get(m.user_uuid);
    return (
      (m.username || '').toLowerCase().includes(keyword) ||
      (info?.account || '').toLowerCase().includes(keyword) ||
      m.user_uuid.toLowerCase().includes(keyword)
    );
  });

  // Basic settings handlers
  const handleSaveName = async () => {
    if (!groupName.trim()) {
      message.warning(intl.formatMessage({ id: 'groupSettings.nameRequired' }));
      return;
    }
    setSaving(true);
    try {
      await update_group({
        group_uuid: groupInfo!.group_uuid,
        group_name: groupName.trim(),
        description: groupDesc,
      });
      message.success(intl.formatMessage({ id: 'groupSettings.saveSuccess' }));
      setEditingName(false);
      loadData();
    } catch {
      message.error(intl.formatMessage({ id: 'groupSettings.saveFailed' }));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDesc = async () => {
    setSaving(true);
    try {
      await update_group({
        group_uuid: groupInfo!.group_uuid,
        group_name: groupName,
        description: groupDesc.trim(),
      });
      message.success(intl.formatMessage({ id: 'groupSettings.saveSuccess' }));
      setEditingDesc(false);
      loadData();
    } catch {
      message.error(intl.formatMessage({ id: 'groupSettings.saveFailed' }));
    } finally {
      setSaving(false);
    }
  };

  // Members handlers
  const loadFriends = async () => {
    try {
      const friends = await get_friend_list();
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
      const invited = await invite_group_members(groupInfo!.group_uuid, selectedFriends);
      message.success(intl.formatMessage({ id: 'groupSettings.members.inviteSent' }, { count: invited.length }));
      setInviteModalOpen(false);
      loadData();
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
          await remove_group_member(groupInfo!.group_uuid, member.user_uuid);
          message.success(intl.formatMessage({ id: 'groupSettings.members.removeMemberSuccess' }));
          loadData();
        } catch {
          message.error(intl.formatMessage({ id: 'groupSettings.members.removeMemberFailed' }));
        }
      },
    });
  };

  const handleSetRole = async (member: GroupMemberVo, role: number) => {
    try {
      await set_member_role({
        group_uuid: groupInfo!.group_uuid,
        user_uuid: member.user_uuid,
        role,
      });
      message.success(role === 1 ? intl.formatMessage({ id: 'groupSettings.members.setAdminSuccess' }) : intl.formatMessage({ id: 'groupSettings.members.removeAdminSuccess' }));
      loadData();
    } catch {
      message.error(intl.formatMessage({ id: 'groupSettings.members.setRoleFailed' }));
    }
  };

  // Management handlers
  const handleLeaveGroup = () => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'groupSettings.leaveGroup' }),
      content: intl.formatMessage({ id: 'groupSettings.leaveGroupConfirm' }),
      okText: intl.formatMessage({ id: 'groupSettings.members.confirm' }),
      okButtonProps: { danger: true },
      cancelText: intl.formatMessage({ id: 'groupSettings.members.cancel' }),
      onOk: async () => {
        try {
          await quit_group(groupInfo!.group_uuid);
          message.success(intl.formatMessage({ id: 'groupSettings.leaveGroupSuccess' }));
          history.push('/home/chats/dashboard');
        } catch {
          message.error(intl.formatMessage({ id: 'groupSettings.leaveGroupFailed' }));
        }
      },
    });
  };

  const handleDissolve = () => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'groupSettings.dissolveGroup' }),
      content: intl.formatMessage({ id: 'groupSettings.dissolveGroupConfirm' }, { name: groupInfo?.group_name }),
      okText: intl.formatMessage({ id: 'groupSettings.dissolveGroupBtn' }),
      okButtonProps: { danger: true },
      cancelText: intl.formatMessage({ id: 'groupSettings.members.cancel' }),
      onOk: async () => {
        try {
          await dissolve_group(groupInfo!.group_uuid);
          message.success(intl.formatMessage({ id: 'groupSettings.dissolveGroupSuccess' }));
          history.push('/home/chats/dashboard');
        } catch {
          message.error(intl.formatMessage({ id: 'groupSettings.dissolveGroupFailed' }));
        }
      },
    });
  };

  const handleTransferOwnership = async () => {
    const membersToTransfer = members.filter((m) => m.user_uuid !== userInfo?.uuid);
    if (membersToTransfer.length === 0) {
      message.warning(intl.formatMessage({ id: 'groupSettings.noMemberToTransfer' }));
      return;
    }

    let selectedUser: string | null = null;

    Modal.confirm({
      title: intl.formatMessage({ id: 'groupSettings.transferOwnership' }),
      content: (
        <div>
          <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
            {intl.formatMessage({ id: 'groupSettings.transferOwnershipDesc' })}
          </div>
          <Select
            style={{ width: '100%' }}
            placeholder={intl.formatMessage({ id: 'groupSettings.selectMember' })}
            onChange={(val) => {
              selectedUser = val;
            }}
            options={membersToTransfer.map((m) => ({
              label: `${m.username || m.user_uuid} (${m.user_uuid})`,
              value: m.user_uuid,
            }))}
          />
        </div>
      ),
      okText: intl.formatMessage({ id: 'groupSettings.transfer' }),
      okButtonProps: { danger: true },
      cancelText: intl.formatMessage({ id: 'groupSettings.members.cancel' }),
      onOk: async () => {
        if (!selectedUser) {
          message.warning(intl.formatMessage({ id: 'groupSettings.selectMemberToTransfer' }));
          return Promise.reject();
        }
        try {
          await set_member_role({
            group_uuid: groupInfo!.group_uuid,
            user_uuid: selectedUser,
            role: 2,
          });
          message.success(intl.formatMessage({ id: 'groupSettings.transferSuccess' }));
          loadData();
        } catch {
          message.error(intl.formatMessage({ id: 'groupSettings.transferFailed' }));
          return Promise.reject();
        }
      },
    });
  };

  const copyGroupId = () => {
    if (groupInfo?.group_uuid) {
      navigator.clipboard.writeText(groupInfo.group_uuid).then(() => {
        message.success(intl.formatMessage({ id: 'groupSettings.groupIdCopied' }));
      }).catch(() => {
        message.error(intl.formatMessage({ id: 'groupSettings.copyFailed' }));
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingText}>{intl.formatMessage({ id: 'groupSettings.loading' })}</div>
      </div>
    );
  }

  if (!groupInfo) {
    return null;
  }

  // Display avatar list (first 8 members + add button)
  const displayMembers = members.slice(0, 8);
  const hasMoreMembers = members.length > 8;

  // Management action items
  const managementItems = [
    { label: intl.formatMessage({ id: 'groupSettings.groupId' }), value: groupInfo.group_uuid, icon: <CopyOutlined />, onClick: copyGroupId, showArrow: true },
    { label: intl.formatMessage({ id: 'groupSettings.members.owner' }), value: (() => {
      const owner = members.find((m) => m.role === 2);
      return owner ? (owner.username || owner.user_uuid) : '-';
    })(), icon: <SafetyCertificateOutlined /> },
    { label: intl.formatMessage({ id: 'groupSettings.createdAt' }), value: groupInfo.created_at ? new Date(groupInfo.created_at).toLocaleDateString('zh-CN') : '-', icon: null },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.backBtn} onClick={() => history.back()}>
          <ArrowLeftOutlined />
        </span>
        <span className={styles.headerTitle}>{intl.formatMessage({ id: 'groupSettings.title' })}</span>
        <span style={{ width: 32 }} />
      </div>

      <div className={styles.scrollContent} ref={scrollRef}>
        {/* Group avatar and name section */}
        <div className={styles.groupHeader}>
          <div
            className={styles.avatarWrapper}
            onClick={canManage ? handleAvatarClick : undefined}
            style={canManage ? { cursor: 'pointer' } : undefined}
          >
            <Spin
              indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
              spinning={avatarUploading}
            >
              <Avatar
                size={72}
                shape="square"
                src={avatarUrl || DEFAULT_ICON}
                className={styles.groupAvatar}
              />
            </Spin>
            {canManage && !avatarUploading && (
              <div className={styles.avatarOverlay}>
                <CameraOutlined style={{ fontSize: 20, color: '#fff' }} />
              </div>
            )}
          </div>
          <div className={styles.groupNameSection}>
            {editingName ? (
              <div className={styles.editNameRow}>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onPressEnter={handleSaveName}
                  autoFocus
                  maxLength={50}
                  className={styles.nameInput}
                />
                <Button type="primary" size="small" onClick={handleSaveName} loading={saving}>
                  {intl.formatMessage({ id: 'groupSettings.members.confirm' })}
                </Button>
                <Button size="small" onClick={() => { setEditingName(false); setGroupName(groupInfo.group_name); }}>
                  {intl.formatMessage({ id: 'groupSettings.members.cancel' })}
                </Button>
              </div>
            ) : (
              <div className={styles.nameRow}>
                <span className={styles.groupName}>{groupInfo.group_name}</span>
                {canManage && (
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingName(true)} />
                )}
              </div>
            )}
            <div className={styles.memberCount}>
              <TeamOutlined /> {intl.formatMessage({ id: 'groupSettings.members.memberCount' }, { count: members.length })}
            </div>
          </div>
        </div>

        {/* Description */}
        {editingDesc ? (
          <div className={styles.descEditSection}>
            <Input.TextArea
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              rows={3}
              maxLength={200}
              showCount
              autoFocus
            />
            <div className={styles.descEditActions}>
              <Button type="primary" size="small" onClick={handleSaveDesc} loading={saving}>
                {intl.formatMessage({ id: 'groupSettings.members.confirm' })}
              </Button>
              <Button size="small" onClick={() => { setEditingDesc(false); setGroupDesc(groupInfo.description || ''); }}>
                {intl.formatMessage({ id: 'groupSettings.members.cancel' })}
              </Button>
            </div>
          </div>
        ) : groupInfo.description ? (
          <div className={styles.descSection} onClick={() => canManage && setEditingDesc(true)}>
            <span className={styles.descText}>{groupInfo.description}</span>
            {canManage && <EditOutlined className={styles.descEditIcon} />}
          </div>
        ) : canManage ? (
          <div className={styles.descEmpty} onClick={() => setEditingDesc(true)}>
            <span>{intl.formatMessage({ id: 'groupSettings.addDescription' })}</span>
            <EditOutlined className={styles.descEditIcon} />
          </div>
        ) : null}

        {/* Members grid row - QQ style */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{intl.formatMessage({ id: 'groupSettings.groupMembers' })}</div>
          <div className={styles.memberGrid}>
            {canManage && (
              <div key="add" className={styles.memberGridItem} onClick={() => { loadFriends(); setInviteModalOpen(true); }}>
                <div className={styles.addMemberBtn}>
                  <UserAddOutlined className={styles.addIcon} />
                </div>
                <span className={styles.memberGridLabel}>{intl.formatMessage({ id: 'groupSettings.add' })}</span>
              </div>
            )}
            {displayMembers.map((member) => {
              const info = memberInfoMap.get(member.user_uuid);
              const displayName = info?.username || member.username || intl.formatMessage({ id: 'groupSettings.members.member' });
              const iconBizId = info?.icon || member.icon;
              const avatarSrc = iconBizId ? avatarMap.get(iconBizId) : undefined;
              return (
              <div key={member.user_uuid} className={styles.memberGridItem}>
                <Avatar
                  size={40}
                  shape="square"
                  icon={<UserOutlined />}
                  src={avatarSrc || DEFAULT_ICON}
                  className={styles.memberAvatar}
                />
                <span className={styles.memberGridLabel}>
                  {member.role === 2 ? intl.formatMessage({ id: 'groupSettings.members.owner' }) : displayName.slice(0, 4)}
                </span>
                {member.user_uuid === userInfo?.uuid && (
                  <Tag className={styles.meTag}>{intl.formatMessage({ id: 'groupSettings.members.me' })}</Tag>
                )}
              </div>
              );
            })}
            {hasMoreMembers && (
              <div
                key="more"
                className={styles.memberGridItem}
                onClick={() => {
                  const el = document.getElementById('memberListSection');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <div className={styles.moreMembersBtn}>
                  <span className={styles.moreText}>+{members.length - 8}</span>
                </div>
                <span className={styles.memberGridLabel}>{intl.formatMessage({ id: 'groupSettings.more' })}</span>
              </div>
            )}
          </div>
        </div>

        {/* Group info items */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{intl.formatMessage({ id: 'groupSettings.groupInfo' })}</div>
          <div className={styles.infoList}>
            {managementItems.map((item) => (
              <div key={item.label} className={styles.infoItem} onClick={item.onClick}>
                {item.icon && <span className={styles.infoIcon}>{item.icon}</span>}
                <span className={styles.infoLabel}>{item.label}</span>
                <span className={styles.infoValue}>{item.value}</span>
                {item.showArrow && <span className={styles.arrow}>&rsaquo;</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Full member list */}
        <div className={styles.section} id="memberListSection">
          <div className={styles.sectionTitle}>{intl.formatMessage({ id: 'groupSettings.allMembers' })}</div>
          <Input.Search
            placeholder={intl.formatMessage({ id: 'groupSettings.members.searchMember' })}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            className={styles.memberSearch}
            allowClear
          />
          <div>
            {filteredMembers.map((member) => {
              const isSelf = member.user_uuid === userInfo?.uuid;
              const info = memberInfoMap.get(member.user_uuid);
              const displayName = info?.username || member.username || member.user_uuid;
              const iconBizId = info?.icon || member.icon;
              const avatarSrc = iconBizId ? avatarMap.get(iconBizId) : undefined;
              const actions: { label: React.ReactNode; onClick: () => void }[] = [];
              if (!isSelf && isOwner) {
                if (member.role === 0) {
                  actions.push({ label: intl.formatMessage({ id: 'groupSettings.members.setAdmin' }), onClick: () => handleSetRole(member, 1) });
                }
                if (member.role === 1) {
                  actions.push({ label: intl.formatMessage({ id: 'groupSettings.members.removeAdmin' }), onClick: () => handleSetRole(member, 0) });
                }
                actions.push({ label: <span style={{ color: 'var(--color-error)' }}>{intl.formatMessage({ id: 'groupSettings.members.removeMember' })}</span>, onClick: () => handleKick(member) });
              } else if (!isSelf && isAdmin && member.role === 0) {
                actions.push({ label: <span style={{ color: 'var(--color-error)' }}>{intl.formatMessage({ id: 'groupSettings.members.removeMember' })}</span>, onClick: () => handleKick(member) });
              }

              return (
                <div key={member.user_uuid} className={styles.memberListItem}>
                  <div className={styles.memberListItemInfo}>
                    <Avatar size={36} icon={<UserOutlined />} src={avatarSrc || DEFAULT_ICON} />
                    <div className={styles.memberTextInfo}>
                      <div>
                        <span className={styles.memberListItemName}>
                          {displayName}
                        </span>
                        {member.role > 0 && (
                          <span className={`${styles.roleTag} ${member.role === 2 ? styles.roleOwner : styles.roleAdmin}`}>
                            {ROLE_TEXT[member.role]}
                          </span>
                        )}
                        {isSelf && <Tag style={{ marginLeft: 4 }} color="blue">{intl.formatMessage({ id: 'groupSettings.members.me' })}</Tag>}
                      </div>
                      <span className={styles.memberItemId}>{info?.account || member.user_uuid}</span>
                    </div>
                  </div>
                  {actions.length > 0 && (
                    <div className={styles.memberActions}>
                      {actions.map((action, idx) => (
                        <Button key={idx} type="text" size="small" onClick={action.onClick} className={styles.actionBtn}>
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Danger zone */}
        <div className={styles.section}>
          {!isOwner && (
            <Button danger block className={styles.dangerBtn} onClick={handleLeaveGroup}>
              {intl.formatMessage({ id: 'groupSettings.leaveGroup' })}
            </Button>
          )}
          {isOwner && (
            <>
              <Button block className={styles.transferBtn} onClick={handleTransferOwnership}>
                {intl.formatMessage({ id: 'groupSettings.transferOwnership' })}
              </Button>
              <div style={{ height: 12 }} />
              <Button danger block className={styles.dangerBtn} onClick={handleDissolve}>
                {intl.formatMessage({ id: 'groupSettings.dissolveGroup' })}
              </Button>
            </>
          )}
        </div>

        <div style={{ height: 40 }} />
      </div>

      {/* Invite Modal */}
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

export default GroupSettingsPage;
