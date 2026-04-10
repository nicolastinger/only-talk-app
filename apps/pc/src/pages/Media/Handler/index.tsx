import { openNewWindow } from '@/components/Window/OpenWindow';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { window } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/core';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { FriendInfo, HttpResponse, P2pInitMsg } from '@workspace/types';
import { Button } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './index.less';

//用户视频接收处理组件
const MediaPage: React.FC = () => {
  const setRequestMediaMsg = useBearStore((state) => state.setRequestMediaMsg);
  const requestMediaMsg = useBearStore((state) => state.requestMediaMsg);

  console.log('requestMediaMsg', requestMediaMsg);
  const [userInfo, setUserInfo] = useState<FriendInfo>();
  const [localP2pInitMsg, setLocalP2pInitMsg] = useState<P2pInitMsg | null>(
    null,
  );
  const [localMediaType, setLocalMediaType] = useState<number>(0);

  const currentWindow = window.getCurrentWindow();

  // 从URL参数读取数据
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const p2pInitMsgParam = urlParams.get('p2pInitMsg');
    const mediaTypeParam = urlParams.get('mediaType');

    if (p2pInitMsgParam) {
      try {
        const p2pInitMsg = JSON.parse(p2pInitMsgParam) as P2pInitMsg;
        setLocalP2pInitMsg(p2pInitMsg);
        console.log('从URL参数读取到p2pInitMsg:', p2pInitMsg);
      } catch (e) {
        console.error('解析URL参数失败:', e);
      }
    }

    if (mediaTypeParam) {
      setLocalMediaType(parseInt(mediaTypeParam));
    }
  }, []);

  // 接受好友视频/音频请求
  const confirm = async () => {
    // 优先使用本地状态，如果没有则使用store中的状态
    let p2pInitMsg = localP2pInitMsg || requestMediaMsg.p2pInitMsg;

    p2pInitMsg.accept = true;
    try {
      const response: HttpResponse = await invoke('process_init_p2p_request', {
        p2pInitMsg: JSON.stringify(p2pInitMsg),
      });
      console.log('response', response);
      const webviewOptions: WebviewOptions = {
        url: '/privacy/chat?friendId=' + p2pInitMsg.request_uuid,
        height: 600,
        width: 800,
        x: 0,
        y: 0,
      };
      await openNewWindow('隐私模式', webviewOptions, currentWindow);
    } catch (e) {
      console.log('处理请求失败', e);
    }
  };

  // 拒绝请求
  const cancel = async () => {
    //TODO
    await currentWindow.close();
  };

  useEffect(() => {
    // 监听requestMediaMsg的变化（作为备用）
    console.log('Handler组件接收到新的requestMediaMsg:', requestMediaMsg);

    // TODO获取好友信息
    // 这里可以根据requestMediaMsg中的信息来获取好友信息
    const p2pInitMsg = localP2pInitMsg || requestMediaMsg.p2pInitMsg;
    if (p2pInitMsg?.request_addr) {
      // 根据request_addr获取好友信息
      // setUserInfo(friendInfo);
    }
  }, [requestMediaMsg, localP2pInitMsg]);

  // 如果没有任何数据，显示加载状态
  if (!localP2pInitMsg && !requestMediaMsg?.p2pInitMsg) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.left}>
          <div>{userInfo?.account || '蔡徐坤'}</div>
          <img
            src={userInfo?.icon || DEFAULT_ICON}
            alt="用户头像"
            className={styles.imgItem}
            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_ICON; }}
          />
        </div>
        <div className={styles.right}>
          发起了隐私模式请求
          <div className={styles.btn}>
            <div className={styles.cancelBtn}>
              <Button
                onClick={cancel}
                variant="solid"
                color="danger"
                shape="circle"
                icon={<CloseOutlined />}
              />
            </div>
            <div className={styles.confirmBtn}>
              <Button
                onClick={confirm}
                variant="solid"
                color="cyan"
                shape="circle"
                icon={<CheckOutlined />}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaPage;
