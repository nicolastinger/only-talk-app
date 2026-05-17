import { listen } from '@tauri-apps/api/event';
import { P2pInitMsg } from '@workspace/types';
import { useEffect } from 'react';

const ProcessQuicP2pStream = () => {
  console.log('渲染了接受视频流组件');
  useEffect(() => {
    console.log('开始监听函数');
    let unlisten: () => void;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('listen_p2p_request', (event) => {
          console.log('接收到的数据', event.payload);
          const quicMsgList = JSON.parse(event.payload) as P2pInitMsg[];
          console.log('quicMsgList', quicMsgList);
          // TODO接收后端消息，选择对应操作逻辑
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
  return null;
};

export default ProcessQuicP2pStream;
