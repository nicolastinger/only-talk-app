import { DEFAULT_ICON } from '@/constants';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  IdcardOutlined,
  MailOutlined,
  ManOutlined,
  PhoneOutlined,
  UserOutlined,
  WomanOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { history, useIntl } from '@umijs/max';
import {
  block_friend,
  get_user_info_with_cache,
  getFiles,
  refresh_user_info,
  unblock_friend,
} from '@workspace/services';
import { FriendVo, UserInfo } from '@workspace/types';
import { Button, Collapse, message, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './styles/FriendInfo.less';

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
  <div className={styles.infoItem}>
    <span className={styles.iconChip}>{icon}</span>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value}</span>
  </div>
);

const FriendInfo = (props: { uuid: string }) => {
  const { uuid } = props;
  const intl = useIntl();
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const genderMap: { [key: number]: string } = {
    0: intl.formatMessage({ id: 'userInfo.genderTypes.unknown' }),
    1: intl.formatMessage({ id: 'userInfo.genderTypes.secret' }),
    2: intl.formatMessage({ id: 'userInfo.genderTypes.male' }),
    3: intl.formatMessage({ id: 'userInfo.genderTypes.female' }),
    4: intl.formatMessage({ id: 'userInfo.genderTypes.robot' }),
    5: intl.formatMessage({ id: 'userInfo.genderTypes.other' }),
  };

  useEffect(() => {
    console.log('uuid', uuid);
    initUserData(uuid);
  }, [uuid]);

  const initUserData = async (uuid: string) => {
    setLoading(true);
    try {
      const result = await get_user_info_with_cache(uuid);
      console.log('get_user_info_with_cache result:', result);

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
        console.log('用户信息来自缓存，后台刷新中...');
        refreshUserInfo(uuid);
      } else {
        // HTTP 拿到的是最新资料, 顺手按 uuid 定向回写本地好友表, 防列表/会话显示旧信息
        writebackFriendProfile(uuid, user);
      }
    } catch (err) {
      console.error('获取用户信息失败', err);
      message.error(
        intl.formatMessage({ id: 'friendInfo.loadError' }) ||
          '获取用户信息失败',
      );
    } finally {
      setLoading(false);
    }
  };

  // HTTP 新资料到手后, 定向回写本地好友表(sqlite 单条), 失败静默
  const writebackFriendProfile = async (friendUuid: string, u: UserInfo) => {
    try {
      await invoke('update_friend_profile_command', {
        friendUuid,
        account: u.account || '',
        name: u.username || '',
        icon: u.icon || '',
        info: u.info || '',
      });
    } catch (e) {
      console.log('回写好友资料到本地失败', e);
    }
  };

  const refreshUserInfo = async (uuid: string) => {
    try {
      const freshUser = await refresh_user_info(uuid);
      console.log('用户信息已刷新:', freshUser);
      setUserInfo(freshUser);

      const friendVo: FriendVo = {
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
      };
      setCurrentFriend(friendVo);

      const icon = await getUserIcon(freshUser.icon || '');
      setFriendIcon(icon);

      writebackFriendProfile(uuid, freshUser);
    } catch (err) {
      console.log('后台刷新用户信息失败', err);
    }
  };

  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const FileVos = await getFiles(icon);
      return FileVos?.[0]?.tauri_file_path || '';
    } catch (error) {
      message.error(intl.formatMessage({ id: 'friendInfo.avatarError' }));
      console.log(error);
      return '';
    }
  };

  const routeToChat = async () => {
    try {
      const res = await invoke('create_chat_session', { friendUuid: uuid });
      console.log('res', res);
      history.push('/home/chats/chat?currentFriend=' + uuid);
    } catch (err) {
      console.log(err);
    }
  };

  const formatBirthday = (timestamp?: number) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN');
  };

  const handleToggleBlock = async () => {
    try {
      if (isBlocked) {
        await unblock_friend(uuid);
        message.success(
          intl.formatMessage({ id: 'friendInfo.unblockedSuccess' }),
        );
        setIsBlocked(false);
      } else {
        await block_friend(uuid);
        message.success(
          intl.formatMessage({ id: 'friendInfo.blockedSuccess' }),
        );
        setIsBlocked(true);
      }
    } catch (error) {
      message.error(
        intl.formatMessage({
          id: isBlocked
            ? 'friendInfo.unblockedFailed'
            : 'friendInfo.blockedFailed',
        }),
      );
      console.error('拉黑操作失败:', error);
    }
  };

  const renderGenderIcon = () => {
    if (userInfo?.gender === 2) return <ManOutlined />;
    if (userInfo?.gender === 3) return <WomanOutlined />;
    return <UserOutlined />;
  };

  if (loading && !userInfo) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.loadingState}>
            <Spin size="large" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = userInfo?.username || currentFriend?.friend_name || '-';
  const displayAccount =
    userInfo?.account || currentFriend?.friend_account || '-';

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.cover} />

        <div className={styles.header}>
          <div className={styles.avatarWrap}>
            <img
              className={styles.icon}
              src={friendIcon || DEFAULT_ICON}
              alt="avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
          </div>
          <div className={styles.name}>{displayName}</div>
          {userInfo?.info && <div className={styles.bio}>{userInfo.info}</div>}
          <div className={styles.metaChips}>
            <span className={styles.chip}>
              {renderGenderIcon()}
              {userInfo?.gender !== undefined
                ? genderMap[userInfo.gender]
                : '-'}
            </span>
            {userInfo?.age ? (
              <span className={styles.chip}>
                <CalendarOutlined />
                {userInfo.age}
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.infoSection}>
          <InfoRow
            icon={<IdcardOutlined />}
            label={intl.formatMessage({ id: 'friendInfo.account' })}
            value={displayAccount}
          />

          <Collapse
            className={styles.collapse}
            ghost
            expandIconPosition="end"
            items={[
              {
                key: '1',
                label: intl.formatMessage({ id: 'friendInfo.moreInfo' }),
                children: (
                  <>
                    <InfoRow
                      icon={<GiftOutlined />}
                      label={intl.formatMessage({ id: 'friendInfo.birthday' })}
                      value={formatBirthday(userInfo?.birthday)}
                    />

                    <InfoRow
                      icon={<PhoneOutlined />}
                      label={intl.formatMessage({ id: 'friendInfo.phone' })}
                      value={userInfo?.phone || '-'}
                    />

                    <InfoRow
                      icon={<MailOutlined />}
                      label={intl.formatMessage({ id: 'friendInfo.email' })}
                      value={userInfo?.email || '-'}
                    />

                    <InfoRow
                      icon={<EnvironmentOutlined />}
                      label={intl.formatMessage({ id: 'friendInfo.address' })}
                      value={userInfo?.address || '-'}
                    />
                  </>
                ),
              },
            ]}
          />
        </div>

        <div className={styles.footer}>
          <Button
            className={styles.primaryBtn}
            color="primary"
            variant="solid"
            onClick={routeToChat}
          >
            {intl.formatMessage({ id: 'friendInfo.sendMessage' })}
          </Button>
          <Button
            className={styles.blockBtn}
            danger={!isBlocked}
            color={isBlocked ? 'default' : 'danger'}
            variant="solid"
            onClick={handleToggleBlock}
          >
            {intl.formatMessage({
              id: isBlocked ? 'friendInfo.unblock' : 'friendInfo.block',
            })}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FriendInfo;
