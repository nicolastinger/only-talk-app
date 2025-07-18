import { SmileOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { Button, Input } from 'antd';
import React, { useState } from 'react';
import styles from './styles/Footer.less';
import { ChatMessage, MessageFrom, TextMsgRaw } from '@/types/user/common';
import { nanoid } from 'nanoid';

const { TextArea } = Input;

interface ChatFooterProps {
  friendUuid: string;
  onMessageSent: (message: string) => void;
}

const ChatFooter: React.FC<ChatFooterProps> = ({
  friendUuid,
  onMessageSent,
}) => {
  const [message, setMessage] = useState('');

  const sendMessage = async () => {
    if (!message.trim()) return;

    let text_msg_raw: TextMsgRaw = {
      nano_id: nanoid(),
      text_type: 1,
      raw: message,
      recv_user: friendUuid,
      send_user: '',
      timestamp: new Date().getTime(),
    };
    const temp: ChatMessage = {
      from: MessageFrom.Mine,
      text_msg_raw,
      ack: false,
    };
    try {
      await invoke('send_text_msg', { msg: message, recvUser: friendUuid, nanoid: text_msg_raw.nano_id });
      onMessageSent(JSON.stringify(temp));
      setMessage('');
    } catch (e) {
      console.log('发送失败', e);
    }
  };

  const sendRequestToP2p = async () => {
    try {
      // 发送udp给服务器
      const res: string = await invoke('send_init_p2p_udp');
      console.log('发送结果', res);
      const quicRes: string = await invoke('send_p2p_init_msg', {
        acceptUser: friendUuid,
      });
      console.log('quic结果', quicRes);
    } catch (e) {
      console.log('发送失败', e);
    }
  };

  return (
    <div className={styles.footer}>
      <div className={styles.footerBtnBar}>
        <div className={styles.footerBtn}>
          <SmileOutlined />
        </div>
        <div className={styles.footerBtn} onClick={sendRequestToP2p}>
          <VideoCameraOutlined />
        </div>
      </div>
      <div className={styles.footerMessage}>
        <TextArea
          onPressEnter={sendMessage}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={styles.footerTextArea}
          placeholder="请输入"
          autoSize
        />
      </div>
      <div className={styles.footerSendBtn}>
        <Button color="default" variant="outlined" onClick={sendMessage}>
          发送(S)
        </Button>
      </div>
    </div>
  );
};

export default React.memo(ChatFooter);