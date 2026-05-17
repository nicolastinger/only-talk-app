import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import {
  ChatMessage,
  MessageFrom,
  TextMsgRaw,
  TextQuicMsgVo,
} from '@workspace/types';
import { Button, Input } from 'antd';
import { TextAreaRef } from 'antd/es/input/TextArea';
import { nanoid } from 'nanoid';
import React, { ChangeEvent, useRef, useState } from 'react';
import FooterToolBar from './FooterToolBar';
import styles from './styles/Footer.less';

const { TextArea } = Input;

interface ChatFooterProps {
  friendUuid: string;
  onMessageSent: (message: string) => void;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
}

const ChatFooter: React.FC<ChatFooterProps> = ({
  friendUuid,
  onMessageSent,
  onUploadStart,
  onUploadEnd,
}) => {
  const intl = useIntl();
  const [message, setMessage] = useState('');
  const textareaRef = useRef<TextAreaRef>(null);

  const sendMessage = async () => {
    const currentMessage =
      textareaRef.current?.resizableTextArea?.textArea.value || message;
    if (!currentMessage.trim()) return;

    let raw: TextMsgRaw = {
      text: currentMessage,
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
      console.log(intl.formatMessage({ id: 'chat.footer.sendFailed' }), e);
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
        onUploadStart={onUploadStart}
        onUploadEnd={onUploadEnd}
      />
      <div className={styles.footerMessage}>
        <TextArea
          onPressEnter={sendMessage}
          value={message}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setMessage(e.target.value)
          }
          className={styles.footerTextArea}
          placeholder={intl.formatMessage({ id: 'chat.inputPlaceholder' })}
        />
        <div className={styles.footerSendBtn}>
          <Button type="primary" variant="outlined" onClick={sendMessage}>
            {intl.formatMessage({ id: 'chat.send' })}(S)
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatFooter);
