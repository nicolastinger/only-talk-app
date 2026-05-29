import { DEFAULT_ICON } from '@/constants';
import { invoke } from '@tauri-apps/api/core';
import { history, useIntl } from '@umijs/max';
import {
  get_user_info_with_cache,
  refresh_user_info,
  getFiles,
} from '@workspace/services';
import { FriendVo, UserInfo } from '@workspace/types';
import {
  ManOutlined,
  WomanOutlined,
  MinusOutlined,
  CopyOutlined,
  MoreOutlined,
  DeleteOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Button, message, Modal, Popconfirm, Dropdown, Tag } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/FriendInfo.less';

const FriendInfo = (props: { uuid: string }) => {
  const { uuid } = props;
  const intl = useIntl();
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initUserData(uuid);
  }, [uuid]);

  const initUserData = async (uuid: string) => {
    setLoading(true);
    try {
      const result = await get_user_info_with_cache(uuid);
      const user = result.user_info;
      setUserInfo(user);

      const friendVo: FriendVo = {
        timestamp: 0,
        friend_id: user.uuid,
        friend_account: user.account || '',
        friend_name: user.username || '',
        friend_icon: user.icon || '',
        friend_status: 0,
        is_del: false,
        is_block: 0,
        is_mute: 0,
        is_top: 0,
        is_show: 1,
      };
      setCurrentFriend(friendVo);

      const icon = await getUserIcon(user.icon || '');
      setFriendIcon(icon);

      if (result.from_cache) {
        refreshUserInfo(uuid);
      }
    } catch (err) {
      console.error('获取用户信息失败', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshUserInfo = async (uuid: string) => {
    try {
      const freshUser = await refresh_user_info(uuid);
      setUserInfo(freshUser);
      setCurrentFriend({
        timestamp: 0,
        friend_id: freshUser.uuid,
        friend_account: freshUser.account || '',
        friend_name: freshUser.username || '',
        friend_icon: freshUser.icon || '',
        friend_status: 0,
        is_del: false,
        is_block: 0,
        is_mute: 0,
        is_top: 0,
        is_show: 1,
      });
      const icon = await getUserIcon(freshUser.icon || '');
      setFriendIcon(icon);
    } catch (err) {
      console.log('后台刷新用户信息失败', err);
    }
  };

  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const FileVos = await getFiles(icon);
      return FileVos?.[0]?.tauri_file_path || '';
    } catch (error) {
      return '';
    }
  };

  const routeToChat = async () => {
    try {
      await invoke('create_chat_session', { friendUuid: uuid });
      history.push('/home/chats/chat?currentFriend=' + uuid);
    } catch (err) {
      console.log(err);
    }
  };

  const handleDeleteFriend = async () => {
    Modal.confirm({
      title: '删除好友',
      content: `确定要删除好友"${userInfo?.username || currentFriend?.friend_name}"吗？`,
      okText: '确定',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await invoke('delete_friend_command', { friendUuid: uuid });
          message.success('已删除好友');
          history.push('/home/contacts');
        } catch (err) {
          message.error('删除好友失败');
        }
      },
    });
  };

  const copyAccount = () => {
    const account = userInfo?.account || currentFriend?.friend_account;
    if (account) {
      navigator.clipboard.writeText(account).then(() => {
        message.success('账号已复制');
      }).catch(() => {
        message.error('复制失败');
      });
    }
  };

  const genderIcon = (gender?: number) => {
    if (gender === 2) return <ManOutlined className={styles.genderIconMale} />;
    if (gender === 3) return <WomanOutlined className={styles.genderIconFemale} />;
    return null;
  };

  const formatBirthday = (timestamp?: number) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  };

  const moreMenuItems = [
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除好友',
      danger: true,
      onClick: handleDeleteFriend,
    },
  ];

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingText}>加载中...</div>
        </div>
      </div>
    );
  }

  if (!userInfo && !currentFriend) {
    return null;
  }

  const name = userInfo?.username || currentFriend?.friend_name || '';
  const account = userInfo?.account || currentFriend?.friend_account || '';
  const bio = userInfo?.info || '';

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Header: avatar + name + actions */}
        <div className={styles.cardHeader}>
          <div className={styles.avatarSection}>
            <img
              className={styles.avatar}
              src={friendIcon || DEFAULT_ICON}
              alt="avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
            <div className={styles.avatarBadge}>
              <div className={styles.onlineDot} />
            </div>
          </div>
          <div className={styles.userSection}>
            <div className={styles.nameRow}>
              <span className={styles.name}>{name}</span>
              {userInfo?.gender !== undefined && userInfo?.gender > 1 && (
                <span className={styles.genderBadge}>
                  {genderIcon(userInfo.gender)}
                </span>
              )}
            </div>
            <div className={styles.accountRow}>
              <span className={styles.account}>账号: {account}</span>
              <CopyOutlined className={styles.copyIcon} onClick={copyAccount} title="复制账号" />
            </div>
            {bio && <div className={styles.bio}>{bio}</div>}
          </div>
          <div className={styles.headerActions}>
            <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </div>
        </div>

        {/* Info list */}
        <div className={styles.infoList}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>账号</span>
            <div className={styles.infoValue}>
              <span>{account || '-'}</span>
              <CopyOutlined className={styles.copyIconSmall} onClick={copyAccount} />
            </div>
          </div>
          <div className={styles.divider} />
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>昵称</span>
            <span className={styles.infoValue}>{name || '-'}</span>
          </div>
          <div className={styles.divider} />
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>性别</span>
            <span className={styles.infoValue}>
              {userInfo?.gender === 2 ? (
                <span><ManOutlined className={styles.genderIconMale} /> 男</span>
              ) : userInfo?.gender === 3 ? (
                <span><WomanOutlined className={styles.genderIconFemale} /> 女</span>
              ) : '-'}
            </span>
          </div>
          <div className={styles.divider} />
          {userInfo?.age && userInfo.age > 0 && (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>年龄</span>
                <span className={styles.infoValue}>{userInfo.age}</span>
              </div>
              <div className={styles.divider} />
            </>
          )}
          {userInfo?.birthday && (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>生日</span>
                <span className={styles.infoValue}>{formatBirthday(userInfo.birthday)}</span>
              </div>
              <div className={styles.divider} />
            </>
          )}
          {userInfo?.phone && (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>电话</span>
                <span className={styles.infoValue}>{userInfo.phone}</span>
              </div>
              <div className={styles.divider} />
            </>
          )}
          {userInfo?.email && (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>邮箱</span>
                <span className={styles.infoValue}>{userInfo.email}</span>
              </div>
              <div className={styles.divider} />
            </>
          )}
          {userInfo?.address && (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>地区</span>
                <span className={styles.infoValue}>{userInfo.address}</span>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className={styles.cardFooter}>
          <Button
            type="primary"
            className={styles.chatBtn}
            onClick={routeToChat}
            block
          >
            发消息
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FriendInfo;
