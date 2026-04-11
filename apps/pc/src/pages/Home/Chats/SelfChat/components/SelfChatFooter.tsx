import { invoke } from '@tauri-apps/api/core';
import { selectFile } from '@workspace/services';
import { ChatMessage, MessageFrom, TextMsgRaw, TextQuicMsgVo } from '@workspace/types';
import { Button, Input, message } from 'antd';
import { TextAreaRef } from 'antd/es/input/TextArea';
import { nanoid } from 'nanoid';
import React, { ChangeEvent, useRef, useState } from 'react';
import { PictureOutlined, SmileOutlined } from '@ant-design/icons';
import styles from './SelfChatFooter.less';

const { TextArea } = Input;

interface SelfChatFooterProps {
  selfUuid: string;
  onMessageSent: (message: string) => void;
}

const EMOJI_LIST = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
  '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
  '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫',
  '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
  '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '👍', '👎',
  '👏', '🙌', '🤝', '🙏', '💪', '🤘', '❤️', '💔', '💯', '🔥',
  '⭐', '✨', '💥', '🎉',
];

/**
 * SelfChat 的 Footer 组件
 * 只保留表情和图片功能，隐藏隐私窗口和 WebRTC 按钮
 */
const SelfChatFooter: React.FC<SelfChatFooterProps> = ({
  selfUuid,
  onMessageSent,
}) => {
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<TextAreaRef>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sendMessage = async () => {
    const currentMessage =
      textareaRef.current?.resizableTextArea?.textArea.value || messageText;
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
      recv_user: selfUuid, // 自己给自己发消息
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
      setMessageText('');
    } catch (e) {
      console.log('发送失败', e);
      message.error('发送失败');
    }
  };

  const sendImage = async () => {
    try {
      const filePaths = await selectFile(false, false, [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ]);

      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
        console.log('Selected image path:', filePath);

        let text_msg_raw: TextQuicMsgVo = {
          nano_id: nanoid(),
          text_type: 2,
          raw: filePath,
          recv_user: selfUuid,
          send_user: '',
          timestamp: new Date().getTime(),
        };

        const temp: ChatMessage = {
          from: MessageFrom.Mine,
          text_msg_raw,
          ack: false,
        };

        await invoke('send_image_msg', { textQuicMsg: text_msg_raw });
        onMessageSent?.(JSON.stringify(temp));
      }
    } catch (e) {
      console.log('发送图片失败', e);
      message.error('发送图片失败');
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setMessageText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div className={styles.footer}>
      <div className={styles.footerBtnBar}>
        <div className={styles.emojiWrapper} ref={emojiPickerRef}>
          <div
            className={styles.footerBtn}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <SmileOutlined />
          </div>
          {showEmojiPicker && (
            <div className={styles.emojiPicker}>
              <div className={styles.emojiGrid}>
                {EMOJI_LIST.map((emoji, index) => (
                  <span
                    key={index}
                    className={styles.emojiItem}
                    onClick={() => handleEmojiClick(emoji)}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className={styles.footerBtn} onClick={sendImage} title="发送图片">
          <PictureOutlined />
        </div>
      </div>
      <div className={styles.footerMessage}>
        <TextArea
          onPressEnter={sendMessage}
          value={messageText}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setMessageText(e.target.value)
          }
          className={styles.footerTextArea}
          placeholder="记点什么..."
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

export default React.memo(SelfChatFooter);
