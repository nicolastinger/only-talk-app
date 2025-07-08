import DraggableHeader from '@/components/DraggableHeader';
import { LeftAside } from '@/components/LeftAside';
import { TALK_API } from '@/constants';
import { useBearStore } from '@/store/store';
import { HttpResponse, ResponseData } from '@/types/backend/httpRust';
import { UserInfo } from '@/types/user/common';
import { CloseOutlined, MinusOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';
import { Outlet } from '@umijs/max';
import { useEffect } from 'react';
import styles from './index.less';

const HomeLayout = () => {
  const setUserInfo = useBearStore((state) => state.setUserInfo);

  console.log('home');
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

  //初始化用户信息
  useEffect(() => {
    initUserInfo();
  }, []);

  const initUserInfo = async () => {
    try {
      const res: HttpResponse = await invoke('post_request', {
        url: TALK_API + '/user/me',
        body: "",
      });
      const data: ResponseData = JSON.parse(res.body);
      const userInfo: UserInfo = data.data;
      await invoke('add_user_map', { map: { me: JSON.stringify(userInfo) } });
      setUserInfo(userInfo);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className={styles.userHomeContainer}>
      <div className={styles.leftSideBar}>
        <LeftAside />
      </div>
      <div className={styles.rightSideBar}>
        <div className={styles.rightSideBarTool}>
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
