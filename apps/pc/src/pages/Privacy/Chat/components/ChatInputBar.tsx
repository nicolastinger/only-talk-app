/**
 * 聊天输入栏：表情选择 + 文本输入 + 发送
 */
import { SendOutlined, SmileOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Input, Tooltip } from 'antd';
import React from 'react';

import { EMOJI_LIST } from '../constants';
import styles from '../index.less';

const { TextArea } = Input;

interface ChatInputBarProps {
  inputText: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  showEmojiPicker: boolean;
  onToggleEmojiPicker: () => void;
  onEmojiClick: (emoji: string) => void;
  emojiPickerRef: React.RefObject<HTMLDivElement>;
}

const ChatInputBar: React.FC<ChatInputBarProps> = ({
  inputText,
  onInputChange,
  onSend,
  onKeyPress,
  showEmojiPicker,
  onToggleEmojiPicker,
  onEmojiClick,
  emojiPickerRef,
}) => {
  const intl = useIntl();

  return (
    <div className={styles.footer}>
      <div className={styles.toolbar}>
        <div className={styles.emojiWrapper} ref={emojiPickerRef}>
          <Tooltip title={intl.formatMessage({ id: 'privacyChat.emoji' })}>
            <Button
              type="text"
              icon={<SmileOutlined />}
              onClick={onToggleEmojiPicker}
              className={styles.toolbarBtn}
            />
          </Tooltip>
          {showEmojiPicker && (
            <div className={styles.emojiPicker}>
              <div className={styles.emojiGrid}>
                {EMOJI_LIST.map((emoji, index) => (
                  <span
                    key={index}
                    className={styles.emojiItem}
                    onClick={() => onEmojiClick(emoji)}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.inputArea}>
        <TextArea
          className={styles.textArea}
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyPress={onKeyPress}
          placeholder={intl.formatMessage({
            id: 'privacyChat.inputPlaceholder',
          })}
          autoSize={{ minRows: 1, maxRows: 3 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={onSend}
          className={styles.sendBtn}
        />
      </div>
    </div>
  );
};

export default ChatInputBar;
