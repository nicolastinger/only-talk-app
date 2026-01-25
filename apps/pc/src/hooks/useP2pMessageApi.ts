import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import { P2pInitMsg, P2pMsg } from '@workspace/types';
import { listen } from '@tauri-apps/api/event';
import { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import { useEffect, useMemo, useState } from 'react';

// TODO p2p通信后续不再默认视频通话，支持文本表情图片文件等
// 接受到p2p请求，打开视频接收组件，
const openMessageHandler = async (p2pInitMsg: P2pInitMsg) => {
  const width = window.screen.width;
  const height = window.screen.height;
  console.log('屏幕分辨率:', width, 'x', height);

  const labelWidth = 280;
  const labelHeight = 140;

  const x = width - labelWidth - 80;
  const y = height - labelHeight - 80;

  // 通过URL参数传递数据
  const urlParams = new URLSearchParams({
    p2pInitMsg: JSON.stringify(p2pInitMsg),
    mediaType: '1',
  });

  const webviewOptions: WebviewOptions = {
    x,
    y,
    url: `/media/handler?${urlParams.toString()}`,
    height: labelHeight,
    width: labelWidth,
  };
  const config: WindowOptions = {};
  await openNewWindowWithoutClose('音视频处理窗口', webviewOptions, config);
};

// 打开视频通话窗口
const openP2pVideoHandler = async (uuid: string, callType: number) => {
  // 通过URL参数传递数据
  const urlParams = new URLSearchParams({
    friendId: uuid,
    callType: callType.toString(),
  });

  console.log('打开新窗口:', urlParams);
  const webviewOptions: WebviewOptions = {
    x: 0,
    y: 0,
    url: `/media/videoCall?${urlParams.toString()}`,
    height: 720,
    width: 1280,
  };
  const config: WindowOptions = {
    center: true,
  };
  await openNewWindowWithoutClose('音视频处理窗口', webviewOptions, config);
};

const useP2pMessageApi = () => {
  const [state, setState] = useState<boolean>(false);

  const setRequestMediaMsg = useBearStore((state) => state.setRequestMediaMsg);
  const requestMediaMsg = useBearStore((state) => state.requestMediaMsg);

  useEffect(() => {
    console.log('值为', requestMediaMsg);
  }, [requestMediaMsg]);

  // 先用if/else,后续升级map
  const processP2pMsg = async (p2pMsg: P2pMsg) => {
    if (p2pMsg.type === 102) {
      // 接收到p2p请求信息
      const p2pInitMsg = JSON.parse(p2pMsg.raw) as P2pInitMsg;
      // 设置状态（用于其他组件使用）
      setRequestMediaMsg({ mediaType: 1, p2pInitMsg });
      // 直接传递数据打开窗口
      await openMessageHandler(p2pInitMsg);
    } else if (p2pMsg.type === 103) {
      // 接收到p2p同意信息
      const uuid = p2pMsg.raw;
      await openP2pVideoHandler(uuid, 0);
    } else if (p2pMsg.type === 104) {
      // 接收到p2p拒绝信息
    } else {
      console.log('接受到意料之外的信息', p2pMsg);
    }
  };

  console.log('渲染了p2p组件');
  useEffect(() => {
    console.log('开始监听函数');
    let unlisten: () => void;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('listen_p2p_request', (event) => {
          console.log('接收到的数据', event.payload);
          const p2pMsg = JSON.parse(event.payload) as P2pMsg;
          console.log('接受到p2p信息', p2pMsg);

          processP2pMsg(p2pMsg);
        });
      } catch (e) {
        console.log('接受信息错误', e);
      }
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten(); // 组件卸载时取消订阅
    };
  }, []);

  return useMemo(() => ({ state }), [state]);
};

export { useP2pMessageApi };
