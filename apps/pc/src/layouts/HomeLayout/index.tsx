import DraggableHeader from '@/components/DraggableHeader';
import { LeftAside } from '@/components/LeftAside';
import OnlineStatusSwitch from '@/components/OnlineStatusSwitch';
import {
  CamouflageButton,
  LanguageButton,
  MuteButton,
  ThemeButton,
} from '@/components/ToolButtons';
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
import { Modal } from 'antd';
import { HttpResponse, ResponseData, UserInfo } from '@workspace/types';
import { useEffect, useState } from 'react';
import styles from './index.less';

const HomeLayout = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
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
    setCloseModalVisible(true);
  };

  // 最小化到系统托盘
  const hideToTray = async () => {
    const currentWindow = Window.getCurrent();
    await invoke('add_user_map', { map: { window_hide: '1' } });
    await currentWindow.hide();
    setCloseModalVisible(false);
  };

  // 直接关闭应用
  const quitApp = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.close();
    setCloseModalVisible(false);
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
    <div className={styles.userHomeContainer}>
      <div className={styles.leftSideBar}>
        <LeftAside />
      </div>
      <div className={styles.rightSideBar}>
        <div className={styles.rightSideBarTool}>
          <div
            className={styles.tools}
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
        <div className={styles.rightSideBarContent}>
          <Outlet />
        </div>
      </div>
      <Modal
        title="关闭窗口"
        open={closeModalVisible}
        onCancel={() => setCloseModalVisible(false)}
        footer={null}
        centered
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 16 }}>请选择关闭方式：</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={hideToTray}
              style={{
                padding: '8px 24px',
                borderRadius: 6,
                border: '1px solid #d9d9d9',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              最小化到托盘
            </button>
            <button
              onClick={quitApp}
              style={{
                padding: '8px 24px',
                borderRadius: 6,
                border: 'none',
                background: '#ff4d4f',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              退出应用
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default HomeLayout;
