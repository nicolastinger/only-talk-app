/**
 * 聊天面板：消息列表 + 输入区 + Emoji 选择器
 */
import { ReloadOutlined, SendOutlined, SmileOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Input, Spin, Tooltip } from 'antd';
import React from 'react';
import { ChatMessageItem } from '../hooks/useWebRTCCall';
import styles from '../index.less';
import { ConnectionState } from './ConnectionStatusTag';

const { TextArea } = Input;

const EMOJI_LIST = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '🤣',
  '😂',
  '🙂',
  '🙃',
  '😉',
  '😊',
  '😇',
  '🥰',
  '😍',
  '🤩',
  '😘',
  '😗',
  '😚',
  '😙',
  '🥲',
  '😋',
  '😛',
  '😜',
  '🤪',
  '😝',
  '🤑',
  '🤗',
  '🤭',
  '🤫',
  '🤔',
  '🤐',
  '🤨',
  '😐',
  '😑',
  '😶',
  '😏',
  '😒',
  '🙄',
  '😬',
  '😮‍💨',
  '🤥',
  '😌',
  '😔',
  '😪',
  '🤤',
  '😴',
  '😷',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🤝',
  '🙏',
  '💪',
  '🤘',
  '❤️',
  '💔',
  '💯',
  '🔥',
  '⭐',
  '✨',
  '💥',
  '🎉',
];

interface ChatPanelProps {
  messages: ChatMessageItem[];
  connectionStatus: ConnectionState;
  isRetrying: boolean;
  inputText: string;
  showEmojiPicker: boolean;
  messageContainerRef: React.RefObject<HTMLDivElement>;
  emojiPickerRef: React.RefObject<HTMLDivElement>;
  onInputChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onToggleEmoji: () => void;
  onEmojiClick: (emoji: string) => void;
  onRetry: () => void;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  connectionStatus,
  isRetrying,
  inputText,
  showEmojiPicker,
  messageContainerRef,
  emojiPickerRef,
  onInputChange,
  onKeyPress,
  onSend,
  onToggleEmoji,
  onEmojiClick,
  onRetry,
}) => {
  const intl = useIntl();

  const renderMessage = (msg: ChatMessageItem) => {
    const displayName = msg.isMine
      ? `${
          msg.senderName || intl.formatMessage({ id: 'webrtc.me' })
        }(${intl.formatMessage({ id: 'webrtc.me' })})`
      : msg.senderName || intl.formatMessage({ id: 'webrtc.peer' });

    return (
      <div key={msg.id} className={styles.messageRow}>
        <div className={styles.messageItem}>
          <div className={styles.messageHeader}>
            <span className={styles.senderName}>{displayName}</span>
            <span className={styles.messageTime}>
              {formatTime(msg.timestamp)}
            </span>
          </div>
          <div
            className={`${styles.messageBubble} ${
              msg.isMine ? styles.mineBubble : styles.friendBubble
            }`}
          >
            {msg.text}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.chatPanel}>
      <div className={styles.hint}>
        {intl.formatMessage({ id: 'webrtc.p2pChatHint' })}
      </div>
      <div ref={messageContainerRef} className={styles.messageContainer}>
        {connectionStatus === 'failed' && (
          <div className={styles.retryContainer}>
            <div className={styles.retryText}>
              {intl.formatMessage({ id: 'webrtc.connectionFailed' })}
            </div>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={isRetrying}
              onClick={onRetry}
            >
              {intl.formatMessage({ id: 'webrtc.retryConnection' })}
            </Button>
          </div>
        )}
        {connectionStatus === 'connecting' && (
          <div className={styles.connectingContainer}>
            <Spin />
            <span className={styles.connectingText}>
              {intl.formatMessage({ id: 'webrtc.establishingConnection' })}
            </span>
          </div>
        )}
        {messages.map(renderMessage)}
      </div>
      <div className={styles.footer}>
        <div className={styles.toolbar}>
          <div className={styles.emojiWrapper} ref={emojiPickerRef}>
            <Tooltip title={intl.formatMessage({ id: 'webrtc.emoji' })}>
              <Button
                type="text"
                icon={<SmileOutlined />}
                onClick={onToggleEmoji}
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
            onChange={(e: any) => onInputChange(e.target.value)}
            onKeyPress={onKeyPress}
            placeholder={intl.formatMessage({ id: 'webrtc.inputMessage' })}
            autoSize={{ minRows: 1, maxRows: 3 }}
            disabled={connectionStatus !== 'connected'}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSend}
            disabled={connectionStatus !== 'connected'}
            className={styles.sendBtn}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
