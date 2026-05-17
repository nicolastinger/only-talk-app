import DraggableHeader from '@/components/DraggableHeader';
import { CamouflageButton } from '@/components/ToolButtons';
import { TALK_API } from '@/constants';
import { useSystemNotify } from '@/hooks/useSystemNotify';
import { useBearStore } from '@/store/store';
import {
  CloseOutlined,
  CompressOutlined,
  ExpandOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';
import { Outlet } from '@umijs/max';
import { HttpResponse, ResponseData, UserInfo } from '@workspace/types';
import { useEffect, useState } from 'react';
import styles from './index.less';

const HomeLayout = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const setUserInfo = useBearStore((state) => state.setUserInfo);
  const userInfo = useBearStore((state) => state.userInfo);

  // 使用系统通知hook
  useSystemNotify(userInfo.uuid);

  // 最小化
  const minimizeWindow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentWindow = Window.getCurrent();
    await currentWindow.minimize();
  };

  // 最大化/还原
  const toggleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentWindow = Window.getCurrent();
    const maximized = await currentWindow.isMaximized();

    if (maximized) {
      await currentWindow.unmaximize();
      setIsMaximized(false);
    } else {
      await currentWindow.maximize();
      setIsMaximized(true);
    }
  };

  // 关闭窗口
  const closeWindow = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      console.log('本地缓存获取用户信息失败', error);
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
    <div className={styles.container}>
      <div className={styles.sideBar}>
        <div className={styles.barTool}>
          <div
            className={styles.tools}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            WPS文字
            {isHovered && (
              <>
                <CamouflageButton />
              </>
            )}
          </div>
          <div className={styles.sideBarToolDraggable}>
            <DraggableHeader />
          </div>
          <div className={styles.sideBarToolButton}>
            <div className={styles.sideBarToolButtonList}>
              <div
                onClick={minimizeWindow}
                onMouseDown={(e) => e.stopPropagation()}
                className={styles.rightButton}
              >
                <MinusOutlined />
              </div>
              <div
                onClick={toggleMaximize}
                onMouseDown={(e) => e.stopPropagation()}
                className={styles.rightButton}
              >
                {isMaximized ? <CompressOutlined /> : <ExpandOutlined />}
              </div>
              <div
                onClick={closeWindow}
                onMouseDown={(e) => e.stopPropagation()}
                className={styles.rightButtonDanger}
              >
                <CloseOutlined />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};
export default HomeLayout;
