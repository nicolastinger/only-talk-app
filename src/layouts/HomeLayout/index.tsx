import DraggableHeader from '@/components/DraggableHeader';
import { LeftAside } from '@/components/LeftAside';
import OnlineStatusSwitch from '@/components/OnlineStatusSwitch';
import { MuteButton, CamouflageButton, LanguageButton, ThemeButton } from '@/components/ToolButtons';
import { TALK_API } from '@/constants';
import { useBearStore } from '@/store/store';
import { HttpResponse, ResponseData } from '@/types/backend/httpRust';
import { UserInfo } from '@/types/user/common';
import { CloseOutlined, MinusOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';
import { Outlet } from '@umijs/max';
import { useEffect, useState } from 'react';
import styles from './index.less';
import { useSystemNotify } from '@/hooks/useSystemNotify';

const HomeLayout = () => {
  const [isHovered, setIsHovered] = useState(false);
  const setUserInfo = useBearStore((state) => state.setUserInfo);
  const userInfo = useBearStore((state) => state.userInfo);

  // 使用系统通知hook
  useSystemNotify(userInfo.uuid);

  // 最小化
  const minimizeWindow = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.minimize();
  };

  // 关闭窗口
  const closeWindow = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.close();
  };

  const initUserInfo = async () => {
    // 先从本地缓存获取
    try { 
      const uuid: string = await invoke('get_user_map', {
        key: 'uuid',
      });
      const me: string = await invoke('get_user_map', {
        key: 'me',
      });
      const userInfo: UserInfo = JSON.parse(me);
      if (uuid === userInfo.uuid) {
        setUserInfo(userInfo);
        return;
      }
    } catch (error) {
      console.log("本地缓存获取用户信息失败", error);
    }
    // 从服务器获取用户信息
    try {
      const res: HttpResponse = await invoke('post_request', {
        url: TALK_API + '/user/me',
        body: '',
      });
      const data: ResponseData = JSON.parse(res.body);
      const userInfo: UserInfo = data.data;
      await invoke('add_user_map', { map: { me: JSON.stringify(userInfo) } });
      setUserInfo(userInfo);
    } catch (error) {
      console.log(error);
    }
  };

  //初始化用户信息
  useEffect(() => {
    initUserInfo();
  }, []);

  return (
    <div className={styles.userHomeContainer}>
      <div className={styles.leftSideBar}>
        <LeftAside />
      </div>
      <div className={styles.rightSideBar}>
        <div className={styles.rightSideBarTool}>
          <div className={styles.tools}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <OnlineStatusSwitch />
            {isHovered && (
              <>
                <MuteButton />
                <CamouflageButton />
                <LanguageButton />
                <ThemeButton />
              </>
            )}
          </div>
          <div className={styles.rightSideBarToolDraggable}>
            <DraggableHeader />
          </div>
          <div className={styles.rightSideBarToolButton}>
            <div className={styles.rightSideBarToolButtonList}>
              <div onClick={minimizeWindow} className={styles.rightButton}>
                <MinusOutlined />
              </div>
              <div onClick={closeWindow} className={styles.rightButtonDanger}>
                <CloseOutlined />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.rightSideBarContent}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};
export default HomeLayout;
