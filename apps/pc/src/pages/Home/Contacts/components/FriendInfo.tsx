import { DEFAULT_ICON } from '@/constants';
import { invoke } from '@tauri-apps/api/core';
import { history, useIntl } from '@umijs/max';
import {
  get_user_info_with_cache,
  refresh_user_info,
  getFiles,
} from '@workspace/services';
import { FriendVo, UserInfo } from '@workspace/types';
import { Button, Collapse, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/FriendInfo.less';

const FriendInfo = (props: { uuid: string }) => {
  const { uuid } = props;
  const intl = useIntl();
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);

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
      }
    } catch (err) {
      console.error('获取用户信息失败', err);
      message.error(intl.formatMessage({ id: 'friendInfo.loadError' }) || '获取用户信息失败');
    } finally {
      setLoading(false);
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

  const renderBtn = () => {
    return (
      <Button color="default" variant="solid" onClick={routeToChat}>
        {intl.formatMessage({ id: 'friendInfo.sendMessage' })}
      </Button>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <img
            className={styles.icon}
            src={friendIcon || DEFAULT_ICON}
            alt="avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
          <div className={styles.name}>
            {userInfo?.username || currentFriend?.friend_name}
          </div>
          {userInfo?.info && <div className={styles.bio}>{userInfo.info}</div>}
        </div>

        <div className={styles.infoSection}>
          <div className={styles.infoItem}>
            <span className={styles.label}>
              {intl.formatMessage({ id: 'friendInfo.account' })}
            </span>
            <span className={styles.value}>
              {userInfo?.account || currentFriend?.friend_account || '-'}
            </span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>
              {intl.formatMessage({ id: 'friendInfo.gender' })}
            </span>
            <span className={styles.value}>
              {userInfo?.gender !== undefined
                ? genderMap[userInfo.gender]
                : '-'}
            </span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>
              {intl.formatMessage({ id: 'friendInfo.age' })}
            </span>
            <span className={styles.value}>{userInfo?.age || '-'}</span>
          </div>

          <Collapse
            className={styles.collapse}
            ghost
            items={[
              {
                key: '1',
                label: intl.formatMessage({ id: 'friendInfo.moreInfo' }),
                children: (
                  <>
                    <div className={styles.infoItem}>
                      <span className={styles.label}>
                        {intl.formatMessage({ id: 'friendInfo.birthday' })}
                      </span>
                      <span className={styles.value}>
                        {formatBirthday(userInfo?.birthday)}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>
                        {intl.formatMessage({ id: 'friendInfo.phone' })}
                      </span>
                      <span className={styles.value}>
                        {userInfo?.phone || '-'}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>
                        {intl.formatMessage({ id: 'friendInfo.email' })}
                      </span>
                      <span className={styles.value}>
                        {userInfo?.email || '-'}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>
                        {intl.formatMessage({ id: 'friendInfo.address' })}
                      </span>
                      <span className={styles.value}>
                        {userInfo?.address || '-'}
                      </span>
                    </div>
                  </>
                ),
              },
            ]}
          />
        </div>

        <div className={styles.footer}>
          <div className={styles.button}>{renderBtn()}</div>
        </div>
      </div>
    </div>
  );
};

export default FriendInfo;
