import { DEFAULT_ICON, TALK_API } from '@/constants';
import { invoke } from '@tauri-apps/api/core';
import { history } from '@umijs/max';
import {
  cache_user_info,
  get_cached_user_info,
  get_friend_info,
  getFiles,
} from '@workspace/services';
import { FriendVo, UserInfo } from '@workspace/types';
import { Button, Collapse, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/FriendInfo.less';
import { invoke_rust } from '@workspace/services';

const genderMap: { [key: number]: string } = {
  0: '未知',
  1: '保密',
  2: '男',
  3: '女',
  4: '机器人',
  5: '其他',
};

const FriendInfo = (props: { uuid: string }) => {
  const { uuid } = props;
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [friendIcon, setFriendIcon] = useState<string>('');

  useEffect(() => {
    console.log('uuid', uuid);
    initUserData(uuid);
  }, [uuid]);

  const initUserData = async (uuid: string) => {
    // 先从 common_db 缓存获取用户信息
    try {
      const cachedUserInfo = await get_cached_user_info(uuid);
      if (cachedUserInfo) {
        setUserInfo(cachedUserInfo);
        const friendVo: FriendVo = {
          timestamp: 0,
          friend_id: cachedUserInfo.uuid,
          friend_account: cachedUserInfo.account || '',
          friend_name: cachedUserInfo.username || '',
          friend_icon: cachedUserInfo.icon || '',
          friend_status: 0,
          is_del: false,
          is_block: 0,
          is_mute: 0,
          is_top: 0,
          is_show: 1,
        };
        setCurrentFriend(friendVo);
        const icon = await getUserIcon(cachedUserInfo.icon || '');
        setFriendIcon(icon);
      }
    } catch (err) {
      console.log('从缓存获取用户信息失败', err);
    }

    // 从本地好友数据库获取好友信息
    try {
      const res = (await get_friend_info(uuid)) as FriendVo;
      console.log('res', res);
      setCurrentFriend(res);
      const icon = await getUserIcon(res.friend_icon || '');
      setFriendIcon(icon);
    } catch (err) {
      console.log('从本地好友数据库获取失败', err);
    }

    // 从远程 API 获取用户信息并更新缓存（参考搜索好友组件）
    try {
      const result = await invoke_rust(
        'post_request',
        TALK_API + '/user/get_user_by_uuid/' + uuid,
        ''
      );
      if (result.netSuccess && result.res.status === 200) {
        const data = JSON.parse(result.res.body);
        const remoteUserInfo: UserInfo = data.data;
        
        setUserInfo(remoteUserInfo);
        
        // 从缓存获取对比
        const cachedUserInfo = await get_cached_user_info(uuid);
        const isDifferent = !cachedUserInfo || 
          JSON.stringify(cachedUserInfo) !== JSON.stringify(remoteUserInfo);
        
        if (isDifferent) {
          await cache_user_info(remoteUserInfo);
        }
        
        // 更新界面显示
        const friendVo: FriendVo = {
          timestamp: 0,
          friend_id: remoteUserInfo.uuid,
          friend_account: remoteUserInfo.account || '',
          friend_name: remoteUserInfo.username || '',
          friend_icon: remoteUserInfo.icon || '',
          friend_status: 0,
          is_del: false,
          is_block: 0,
          is_mute: 0,
          is_top: 0,
          is_show: 1,
        };
        setCurrentFriend(friendVo);
        const icon = await getUserIcon(remoteUserInfo.icon || '');
        setFriendIcon(icon);
      }
    } catch (err) {
      console.log('从远程获取用户信息失败', err);
    }
  };

  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const FileVos = await getFiles(icon);
      return FileVos?.[0]?.tauri_file_path || '';
    } catch (error) {
      message.error('获取用户头像时出现错误');
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
        发送消息
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
          <div className={styles.name}>{userInfo?.username || currentFriend?.friend_name}</div>
          {userInfo?.info && <div className={styles.bio}>{userInfo.info}</div>}
        </div>
        
        <div className={styles.infoSection}>
          <div className={styles.infoItem}>
            <span className={styles.label}>账号</span>
            <span className={styles.value}>{userInfo?.account || currentFriend?.friend_account || '-'}</span>
          </div>
          
          <div className={styles.infoItem}>
            <span className={styles.label}>性别</span>
            <span className={styles.value}>{userInfo?.gender !== undefined ? genderMap[userInfo.gender] : '-'}</span>
          </div>
          
          <div className={styles.infoItem}>
            <span className={styles.label}>年龄</span>
            <span className={styles.value}>{userInfo?.age || '-'}</span>
          </div>
          
          <Collapse
            className={styles.collapse}
            ghost
            items={[
              {
                key: '1',
                label: '更多信息',
                children: (
                  <>
                    <div className={styles.infoItem}>
                      <span className={styles.label}>生日</span>
                      <span className={styles.value}>{formatBirthday(userInfo?.birthday)}</span>
                    </div>
                    
                    <div className={styles.infoItem}>
                      <span className={styles.label}>手机</span>
                      <span className={styles.value}>{userInfo?.phone || '-'}</span>
                    </div>
                    
                    <div className={styles.infoItem}>
                      <span className={styles.label}>邮箱</span>
                      <span className={styles.value}>{userInfo?.email || '-'}</span>
                    </div>
                    
                    <div className={styles.infoItem}>
                      <span className={styles.label}>地址</span>
                      <span className={styles.value}>{userInfo?.address || '-'}</span>
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
