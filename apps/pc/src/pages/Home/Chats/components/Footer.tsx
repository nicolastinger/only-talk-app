import { invoke } from '@tauri-apps/api/core';
import {
  ChatMessage,
  MessageFrom,
  TextMsgRaw,
  TextQuicMsgVo,
} from '@workspace/types';
import { Button, Input } from 'antd';
import { nanoid } from 'nanoid';
import React, { useState } from 'react';
import FooterToolBar from './FooterToolBar';
import styles from './styles/Footer.less';

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

    let raw: TextMsgRaw = {
      text: message,
      prev_id: '',
      platform: 0,
    };

    let text_msg_raw: TextQuicMsgVo = {
      nano_id: nanoid(),
      text_type: 1,
      raw: JSON.stringify(raw),
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
      await invoke('send_text_msg', { textQuicMsg: text_msg_raw });
      onMessageSent(JSON.stringify(temp));
      setMessage('');
    } catch (e) {
      console.log('发送失败', e);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((prevMessage) => prevMessage + emoji);
  };

  return (
    <div className={styles.footer}>
      <FooterToolBar
        friendUuid={friendUuid}
        onEmojiSelect={handleEmojiSelect}
        onMessageSent={onMessageSent}
      />
      <div className={styles.footerMessage}>
        <TextArea
          onPressEnter={sendMessage}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={styles.footerTextArea}
          placeholder="请输入"
        />
        <div className={styles.footerSendBtn}>
          <Button type="primary" variant="outlined" onClick={sendMessage}>
            发送(S)
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatFooter);
