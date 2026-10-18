import { openWebRTCChatHandler } from '@/hooks/useWebRTCSignalApi';
import { useBearStore } from '@/store/store';
import {
  AudioOutlined,
  ApiOutlined,
  LockOutlined,
  PaperClipOutlined,
  PictureOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import {
  getAllFileExtensions,
  getImageExtensions,
  getLocalFileSize,
  selectFile,
} from '@workspace/services';
import {
  ChatMessage,
  MessageFrom,
  TextQuicMsgVo,
  UPLOAD_LIMITS,
} from '@workspace/types';
import { message } from 'antd';
import { nanoid } from 'nanoid';
import React, { useEffect, useRef, useState } from 'react';
import type { VoiceRecordingResult } from '@/utils/voiceRecorder';
import VoiceRecordModal from './VoiceRecordModal';
import styles from './styles/FooterToolBar.less';

interface FooterToolBarProps {
  friendUuid: string;
  onEmojiSelect?: (emoji: string) => void;
  onMessageSent?: (message: string) => void;
  onUploadStart?: (nanoId?: string) => void;
  onUploadEnd?: (nanoId?: string) => void;
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
  const [showVoiceRecord, setShowVoiceRecord] = useState(false);
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
        { name: 'Images', extensions: await getImageExtensions() },
      ]);

      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
        console.log('Selected image path:', filePath);

        const size = await getLocalFileSize(filePath);
        if (size > UPLOAD_LIMITS.image) {
          message.error(
            intl.formatMessage(
              { id: 'chat.imageTooLarge' },
              { limit: Math.floor(UPLOAD_LIMITS.image / (1024 * 1024)) },
            ),
          );
          return;
        }

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

        // 先上屏(展示气泡与上传进度)，再执行发送
        onMessageSent?.(JSON.stringify(temp));
        onUploadStart?.(text_msg_raw.nano_id);
        try {
          await invoke('send_image_msg', { textQuicMsg: text_msg_raw });
        } finally {
          onUploadEnd?.(text_msg_raw.nano_id);
        }
      }
    } catch (e) {
      console.log('发送图片失败', e);
      onUploadEnd?.();
    }
  };

  const sendFile = async () => {
    try {
      const filePaths = await selectFile(false, false, [
        { name: 'Files', extensions: await getAllFileExtensions() },
      ]);

      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
        console.log('Selected file path:', filePath);

        const size = await getLocalFileSize(filePath);
        if (size > UPLOAD_LIMITS.file) {
          message.error(
            intl.formatMessage(
              { id: 'chat.fileTooLarge' },
              { limit: Math.floor(UPLOAD_LIMITS.file / (1024 * 1024)) },
            ),
          );
          return;
        }

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

        // 先上屏(展示气泡与上传进度)，再执行发送
        onMessageSent?.(JSON.stringify(temp));
        onUploadStart?.(text_msg_raw.nano_id);
        try {
          await invoke('send_file_msg', { textQuicMsg: text_msg_raw });
        } finally {
          onUploadEnd?.(text_msg_raw.nano_id);
        }
      }
    } catch (e) {
      console.log('发送文件失败', e);
      onUploadEnd?.();
    }
  };

  const sendVoice = async (recording: VoiceRecordingResult) => {
    const text_msg_raw: TextQuicMsgVo = {
      nano_id: nanoid(),
      text_type: 21,
      raw: recording.path,
      recv_user: friendUuid,
      send_user: '',
      timestamp: new Date().getTime(),
    };

    const temp: ChatMessage = {
      from: MessageFrom.Mine,
      text_msg_raw,
      ack: false,
    };

    // 先上屏(展示气泡与上传进度)，再执行发送
    onMessageSent?.(JSON.stringify(temp));
    onUploadStart?.(text_msg_raw.nano_id);
    try {
      await invoke('send_voice_msg', {
        textQuicMsg: text_msg_raw,
        duration: recording.duration,
      });
    } catch (e) {
      console.log('发送语音失败', e);
      message.error(intl.formatMessage({ id: 'chat.voice.failed' }));
    } finally {
      onUploadEnd?.(text_msg_raw.nano_id);
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

      // 完全解耦：点击即打开发起方 WebRTC 窗口，邀请/接受/拒绝都在窗口内处理
      const sessionId = nanoid();
      await openWebRTCChatHandler(
        friendUuid,
        localUserId,
        true,
        undefined,
        sessionId,
      );
      console.log(
        `[WebRTC] 已打开发起方 WebRTC 窗口 - friendId: ${friendUuid}, sessionId: ${sessionId}`,
      );
    } catch (e) {
      console.error('发起 WebRTC 失败:', e);
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
      <div
        className={styles.footerBtn}
        onClick={sendImage}
        title={intl.formatMessage({ id: 'chat.footer.sendImage' })}
      >
        <PictureOutlined />
      </div>
      <div
        className={styles.footerBtn}
        onClick={sendFile}
        title={intl.formatMessage({ id: 'chat.footer.sendFile' })}
      >
        <PaperClipOutlined />
      </div>
      <div
        className={styles.footerBtn}
        onClick={() => setShowVoiceRecord(true)}
        title={intl.formatMessage({ id: 'chat.voice.sendVoice' })}
      >
        <AudioOutlined />
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
      <VoiceRecordModal
        open={showVoiceRecord}
        onCancel={() => setShowVoiceRecord(false)}
        onSend={sendVoice}
      />
    </div>
  );
};

export default React.memo(FooterToolBar);
