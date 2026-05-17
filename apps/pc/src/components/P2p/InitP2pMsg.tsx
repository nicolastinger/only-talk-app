import { invoke } from '@tauri-apps/api/core';
import { Button, Input } from 'antd';
import { useState } from 'react';

const InitP2pMsg = () => {
  const [localAddr, setLocalAddr] = useState<string>();
  const [remoteAddr, setRemoteAddr] = useState<string>();

  const sendP2pMsg = async () => {
    console.log('发送参数', localAddr, remoteAddr);
    const res = await invoke('send_udp_p2p_init_msg', {
      localAddr,
      remoteAddr,
    });
    console.log('发送结果', res, localAddr);
  };

  return (
    <div>
      <Input
        value={localAddr}
        onChange={(e) => setLocalAddr(e.target.value)}
        placeholder={'发送方'}
      ></Input>
      <Input
        value={remoteAddr}
        onChange={(e) => setRemoteAddr(e.target.value)}
        placeholder={'接收方'}
      ></Input>
      <Button onClick={sendP2pMsg}>发送p2p消息</Button>
    </div>
  );
};
export default InitP2pMsg;
