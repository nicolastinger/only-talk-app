import { DEFAULT_ICON, TALK_API } from '@/constants';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useBearStore } from '@/store/store';
import { GroupMemberVo, GroupVo } from '@workspace/types';
import { get_group_info, get_group_members, update_group, quit_group, dissolve_group, get_friend_list, invite_group_members, remove_group_member, set_member_role } from '@workspace/services';
import { convertPathToTauriUrl, getFiles, selectFile } from '@workspace/services';
import { history, useSearchParams } from '@umijs/max';
import { Avatar, Button, Input, List, Modal, Select, Tag, message, Spin } from 'antd';
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

const ROLE_TEXT: Record<number, string> = { 2: '群主', 1: '管理员', 0: '成员' };

const GroupSettingsPage = () => {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') || '';
  const { userInfo } = useBearStore();

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
      console.error('加载群设置失败', error);
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
            message.success('群头像更新成功');
          } else {
            message.error('获取群头像文件失败');
          }
        } else {
          message.error(responseBody.msg || '群头像上传失败');
        }
      } else {
        message.error('群头像上传失败');
      }
    } catch (error: any) {
      console.error('群头像更新失败:', error);
      message.error(error.message || '群头像更新失败');
    } finally {
      setAvatarUploading(false);
    }
  };

  const isOwner = groupInfo?.owner_uuid === userInfo?.uuid;
  const isAdmin = members.some((m) => m.user_id === userInfo?.uuid && m.role >= 1);
  const canManage = isOwner || isAdmin;

  const memberUuids = useMemo(
    () => members.map((m) => m.user_id).filter(Boolean),
    [members],
  );
  const { memberInfoMap } = useGroupMemberInfo(memberUuids);

  const filteredMembers = members.filter((m) => {
    const keyword = searchText.toLowerCase();
    return (
      (m.nickname || '').toLowerCase().includes(keyword) ||
      (m.username || '').toLowerCase().includes(keyword) ||
      m.user_id.toLowerCase().includes(keyword)
    );
  });

  // Basic settings handlers
  const handleSaveName = async () => {
    if (!groupName.trim()) {
      message.warning('群名称不能为空');
      return;
    }
    setSaving(true);
    try {
      await update_group({
        group_uuid: groupInfo!.group_uuid,
        group_name: groupName.trim(),
        description: groupDesc,
      });
      message.success('保存成功');
      setEditingName(false);
      loadData();
    } catch {
      message.error('保存失败');
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
      message.success('保存成功');
      setEditingDesc(false);
      loadData();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Members handlers
  const loadFriends = async () => {
    try {
      const friends = await get_friend_list();
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
      const invited = await invite_group_members(groupInfo!.group_uuid, selectedFriends);
      message.success(`已向 ${invited.length} 位好友发送群邀请`);
      setInviteModalOpen(false);
      loadData();
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
          await remove_group_member(groupInfo!.group_uuid, member.user_id);
          message.success('已移出群聊');
          loadData();
        } catch {
          message.error('移出群聊失败');
        }
      },
    });
  };

  const handleSetRole = async (member: GroupMemberVo, role: number) => {
    try {
      await set_member_role({
        group_uuid: groupInfo!.group_uuid,
        user_uuid: member.user_id,
        role,
      });
      message.success(role === 1 ? '已设为管理员' : '已取消管理员');
      loadData();
    } catch {
      message.error('设置失败');
    }
  };

  // Management handlers
  const handleLeaveGroup = () => {
    Modal.confirm({
      title: '退出群聊',
      content: '确定要退出该群聊吗？',
      okText: '确定',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await quit_group(groupInfo!.group_uuid);
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
      content: `确定要解散"${groupInfo?.group_name}"吗？此操作不可恢复。`,
      okText: '确定解散',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await dissolve_group(groupInfo!.group_uuid);
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
            group_uuid: groupInfo!.group_uuid,
            user_uuid: selectedUser,
            role: 2,
          });
          message.success('群主已转让');
          loadData();
        } catch {
          message.error('转让失败');
          return Promise.reject();
        }
      },
    });
  };

  const copyGroupId = () => {
    if (groupInfo?.group_uuid) {
      navigator.clipboard.writeText(groupInfo.group_uuid).then(() => {
        message.success('群号已复制');
      }).catch(() => {
        message.error('复制失败');
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingText}>加载中...</div>
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
    { label: '群号', value: groupInfo.group_uuid, icon: <CopyOutlined />, onClick: copyGroupId, showArrow: true },
    { label: '群主', value: (() => {
      const owner = members.find((m) => m.role === 2);
      return owner ? (owner.nickname || owner.user_id) : '-';
    })(), icon: <SafetyCertificateOutlined /> },
    { label: '创建时间', value: groupInfo.created_at ? new Date(groupInfo.created_at).toLocaleDateString('zh-CN') : '-', icon: null },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.backBtn} onClick={() => history.back()}>
          <ArrowLeftOutlined />
        </span>
        <span className={styles.headerTitle}>群聊设置</span>
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
                  确定
                </Button>
                <Button size="small" onClick={() => { setEditingName(false); setGroupName(groupInfo.group_name); }}>
                  取消
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
              <TeamOutlined /> {members.length} 位成员
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
                确定
              </Button>
              <Button size="small" onClick={() => { setEditingDesc(false); setGroupDesc(groupInfo.description || ''); }}>
                取消
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
            <span>添加群简介</span>
            <EditOutlined className={styles.descEditIcon} />
          </div>
        ) : null}

        {/* Members grid row - QQ style */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>群成员</div>
          <div className={styles.memberGrid}>
            {canManage && (
              <div className={styles.memberGridItem} onClick={() => { loadFriends(); setInviteModalOpen(true); }}>
                <div className={styles.addMemberBtn}>
                  <UserAddOutlined className={styles.addIcon} />
                </div>
                <span className={styles.memberGridLabel}>添加</span>
              </div>
            )}
            {displayMembers.map((member) => {
              const info = memberInfoMap.get(member.user_id);
              const displayName = info?.username || member.nickname || member.username || '成员';
              const displayIcon = info?.icon || member.icon;
              return (
              <div key={member.user_id} className={styles.memberGridItem}>
                <Avatar
                  size={40}
                  shape="square"
                  icon={<UserOutlined />}
                  src={displayIcon}
                  className={styles.memberAvatar}
                />
                <span className={styles.memberGridLabel}>
                  {member.role === 2 ? '群主' : displayName.slice(0, 4)}
                </span>
                {member.user_id === userInfo?.uuid && (
                  <Tag className={styles.meTag}>我</Tag>
                )}
              </div>
              );
            })}
            {hasMoreMembers && (
              <div
                className={styles.memberGridItem}
                onClick={() => {
                  const el = document.getElementById('memberListSection');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <div className={styles.moreMembersBtn}>
                  <span className={styles.moreText}>+{members.length - 8}</span>
                </div>
                <span className={styles.memberGridLabel}>更多</span>
              </div>
            )}
          </div>
        </div>

        {/* Group info items */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>群信息</div>
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
          <div className={styles.sectionTitle}>全部成员</div>
          <Input.Search
            placeholder="搜索成员"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            className={styles.memberSearch}
            allowClear
          />
          <List
            dataSource={filteredMembers}
            renderItem={(member) => {
              const isSelf = member.user_id === userInfo?.uuid;
              const info = memberInfoMap.get(member.user_id);
              const displayName = info?.username || member.nickname || member.username || member.user_id;
              const displayIcon = info?.icon || member.icon;
              const actions: { label: React.ReactNode; onClick: () => void }[] = [];
              if (!isSelf && isOwner) {
                if (member.role === 0) {
                  actions.push({ label: '设为管理员', onClick: () => handleSetRole(member, 1) });
                }
                if (member.role === 1) {
                  actions.push({ label: '取消管理员', onClick: () => handleSetRole(member, 0) });
                }
                actions.push({ label: <span style={{ color: 'var(--color-error)' }}>移出群聊</span>, onClick: () => handleKick(member) });
              } else if (!isSelf && isAdmin && member.role === 0) {
                actions.push({ label: <span style={{ color: 'var(--color-error)' }}>移出群聊</span>, onClick: () => handleKick(member) });
              }

              return (
                <div className={styles.memberListItem}>
                  <div className={styles.memberListItemInfo}>
                    <Avatar size={36} icon={<UserOutlined />} src={displayIcon} />
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
                        {isSelf && <Tag style={{ marginLeft: 4 }} color="blue">我</Tag>}
                      </div>
                      <span className={styles.memberItemId}>{member.user_id}</span>
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
            }}
          />
        </div>

        {/* Danger zone */}
        <div className={styles.section}>
          {!isOwner && (
            <Button danger block className={styles.dangerBtn} onClick={handleLeaveGroup}>
              退出群聊
            </Button>
          )}
          {isOwner && (
            <>
              <Button block className={styles.transferBtn} onClick={handleTransferOwnership}>
                转让群主
              </Button>
              <div style={{ height: 12 }} />
              <Button danger block className={styles.dangerBtn} onClick={handleDissolve}>
                解散群聊
              </Button>
            </>
          )}
        </div>

        <div style={{ height: 40 }} />
      </div>

      {/* Invite Modal */}
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

export default GroupSettingsPage;
