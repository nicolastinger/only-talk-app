import { openWebRTCChatHandler } from '@/hooks/useWebRTCSignalApi';
import { getWebRTCService, initWebRTCService } from '@/services/webrtcService';
import { useBearStore } from '@/store/store';
import {
  ApiOutlined,
  FileOutlined,
  LockOutlined,
  PictureOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import { selectFile } from '@workspace/services';
import { ChatMessage, MessageFrom, TextQuicMsgVo } from '@workspace/types';
import { message } from 'antd';
import { nanoid } from 'nanoid';
import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/FooterToolBar.less';

interface FooterToolBarProps {
  friendUuid: string;
  onEmojiSelect?: (emoji: string) => void;
  onMessageSent?: (message: string) => void;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
}

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

const FooterToolBar: React.FC<FooterToolBarProps> = ({
  friendUuid,
  onEmojiSelect,
  onMessageSent,
  onUploadStart,
  onUploadEnd,
}) => {
  const intl = useIntl();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const userInfo = useBearStore((state) => state.userInfo);

  useEffect(() => {
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
          recv_user: friendUuid,
          send_user: '',
          timestamp: new Date().getTime(),
        };

        const temp: ChatMessage = {
          from: MessageFrom.Mine,
          text_msg_raw,
          ack: false,
        };

        onUploadStart?.();
        try {
          await invoke('send_image_msg', { textQuicMsg: text_msg_raw });
          onMessageSent?.(JSON.stringify(temp));
        } finally {
          onUploadEnd?.();
        }
      }
    } catch (e) {
      console.log('发送图片失败', e);
      onUploadEnd?.();
    }
  };

  const sendFile = async () => {
    try {
      const filePaths = await selectFile(false, false);

      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
        console.log('Selected file path:', filePath);

        let text_msg_raw: TextQuicMsgVo = {
          nano_id: nanoid(),
          text_type: 3,
          raw: filePath,
          recv_user: friendUuid,
          send_user: '',
          timestamp: new Date().getTime(),
        };

        const temp: ChatMessage = {
          from: MessageFrom.Mine,
          text_msg_raw,
          ack: false,
        };

        onUploadStart?.();
        try {
          await invoke('send_file_msg', { textQuicMsg: text_msg_raw });
          onMessageSent?.(JSON.stringify(temp));
        } finally {
          onUploadEnd?.();
        }
      }
    } catch (e) {
      console.log('发送文件失败', e);
      onUploadEnd?.();
    }
  };

  const sendRequestToP2p = async () => {
    try {
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

  const startWebRTCChat = async () => {
    try {
      const localUserId = userInfo.uuid;
      if (!localUserId) {
        message.error(intl.formatMessage({ id: 'chat.footer.userInfoError' }));
        return;
      }

      let service = getWebRTCService();
      if (!service) {
        service = initWebRTCService(localUserId);
      }

      await openWebRTCChatHandler(friendUuid, localUserId, true);
    } catch (e) {
      console.error('发起 WebRTC 聊天失败:', e);
      message.error(intl.formatMessage({ id: 'chat.footer.webRTCFailed' }));
    }
  };

  const handleEmojiClick = (emoji: string) => {
    console.log('Selected emoji:', emoji);
    onEmojiSelect?.(emoji);
    setShowEmojiPicker(false);
  };

  return (
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
      <div className={styles.footerBtn} onClick={sendImage} title={intl.formatMessage({ id: 'chat.footer.sendImage' })}>
        <PictureOutlined />
      </div>
      <div className={styles.footerBtn} onClick={sendFile} title={intl.formatMessage({ id: 'chat.footer.sendFile' })}>
        <FileOutlined />
      </div>
      <div
        className={styles.footerBtn}
        onClick={sendRequestToP2p}
        title={intl.formatMessage({ id: 'chat.footer.privateChat' })}
      >
        <LockOutlined />
      </div>
      <div
        className={styles.footerBtn}
        onClick={startWebRTCChat}
        title={intl.formatMessage({ id: 'chat.footer.startWebRTC' })}
      >
        <ApiOutlined />
      </div>
    </div>
  );
};

export default React.memo(FooterToolBar);
