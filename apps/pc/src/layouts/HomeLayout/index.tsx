import DraggableHeader from '@/components/DraggableHeader';
import { LeftAside } from '@/components/LeftAside';
import OnlineStatusSwitch from '@/components/OnlineStatusSwitch';
import {
  CamouflageButton,
  LanguageButton,
  MuteButton,
  QuicDisconnectButton,
  QuicReconnectButton,
  ThemeButton,
} from '@/components/ToolButtons';
import { TALK_API } from '@/constants';
import { useQuicDisconnect } from '@/hooks/useQuicDisconnect';
import { useSystemNotify } from '@/hooks/useSystemNotify';
import { useBearStore } from '@/store/store';
import {
  CloseOutlined,
  CompressOutlined,
  ExpandOutlined,
  MinusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';
import { Outlet, useIntl } from '@umijs/max';
import { cache_user_info, get_cached_user_info } from '@workspace/services';
import { HttpResponse, ResponseData, UserInfo } from '@workspace/types';
import { Modal } from 'antd';
import { useEffect, useState } from 'react';
import styles from './index.less';

const HomeLayout = () => {
  const intl = useIntl();
  const [isHovered, setIsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const setUserInfo = useBearStore((state) => state.setUserInfo);
  const userInfo = useBearStore((state) => state.userInfo);
  const { isConnected, resetConnection } = useQuicDisconnect();

  // 使用系统通知hook
  useSystemNotify(userInfo.uuid);

  // 处理重新连接
  const handleReconnect = async () => {
    if (isReconnecting) return;

    try {
      setIsReconnecting(true);
      await invoke('reconnect_quic_command');
      // 重连请求已发送，重置状态
      resetConnection();
    } catch (error) {
      console.error('重新连接失败:', error);
    } finally {
      setIsReconnecting(false);
    }
  };

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
      const remoteUserInfo: UserInfo = data.data;

      // 从 common_db 获取缓存的用户信息
      const cachedUserInfo = await get_cached_user_info(remoteUserInfo.uuid);

      // 对比本地缓存和远程数据，如果不一样再更新
      const isDifferent =
        !cachedUserInfo ||
        JSON.stringify(cachedUserInfo) !== JSON.stringify(remoteUserInfo);

      if (isDifferent) {
        await cache_user_info(remoteUserInfo);
      }

      await invoke('add_user_map', {
        map: { me: JSON.stringify(remoteUserInfo) },
      });
      setUserInfo(remoteUserInfo);
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
                <QuicDisconnectButton />
                <QuicReconnectButton />
              </>
            )}
          </div>
          <div className={styles.rightSideBarToolDraggable}>
            <DraggableHeader />
          </div>
          {!isConnected && (
            <div className={styles.quicReconnectTip}>
              <span className={styles.tipIcon}>⚠️</span>
              <span className={styles.tipText}>
                {intl.formatMessage({ id: 'homeLayout.connectionDisconnected' })}
              </span>
              <div
                className={styles.tipReconnectButton}
                onClick={handleReconnect}
              >
                <ReloadOutlined spin={isReconnecting} />
                <span>{isReconnecting ? intl.formatMessage({ id: 'homeLayout.reconnecting' }) : intl.formatMessage({ id: 'homeLayout.reconnect' })}</span>
              </div>
            </div>
          )}
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
        title={intl.formatMessage({ id: 'homeLayout.closeWindow' })}
        open={closeModalVisible}
        onCancel={() => setCloseModalVisible(false)}
        footer={null}
        centered
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 16 }}>{intl.formatMessage({ id: 'homeLayout.selectCloseMethod' })}</p>
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
              {intl.formatMessage({ id: 'homeLayout.minimizeToTray' })}
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
              {intl.formatMessage({ id: 'homeLayout.quitApp' })}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default HomeLayout;
