import { useBackendEvent } from '@/hooks/useBackendEvent';
import { P2pInitMsg } from '@workspace/types';

const ProcessQuicP2pStream = () => {
  console.log('渲染了接受视频流组件');
  useBackendEvent('listen_p2p_request', (payload) => {
    console.log('接收到的数据', payload);
    const quicMsgList = JSON.parse(payload) as P2pInitMsg[];
    console.log('quicMsgList', quicMsgList);
    // TODO接收后端消息，选择对应操作逻辑
  });
  return null;
};

export default ProcessQuicP2pStream;
