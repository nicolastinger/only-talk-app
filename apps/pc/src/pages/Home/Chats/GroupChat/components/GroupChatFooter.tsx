import {
  AudioOutlined,
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
import { Button, Input, message } from 'antd';
import { TextAreaRef } from 'antd/es/input/TextArea';
import { nanoid } from 'nanoid';
import React, { ChangeEvent, useEffect, useRef, useState } from 'react';
import type { VoiceRecordingResult } from '@/utils/voiceRecorder';
import VoiceRecordModal from '../../components/VoiceRecordModal';
import styles from './GroupChatFooter.less';

const { TextArea } = Input;

const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;
const MSG_TYPE_GROUP_VOICE = 2006;

interface GroupChatFooterProps {
  groupUuid: string;
  onMessageSent: (message: string) => void;
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

const GroupChatFooter: React.FC<GroupChatFooterProps> = ({
  groupUuid,
  onMessageSent,
  onUploadStart,
  onUploadEnd,
}) => {
  const intl = useIntl();
  const [msg, setMsg] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<TextAreaRef>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [showVoiceRecord, setShowVoiceRecord] = useState(false);

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

  const sendMessage = async () => {
    const currentMessage =
      textareaRef.current?.resizableTextArea?.textArea.value || msg;
    if (!currentMessage.trim()) return;

    const text_msg_raw: TextQuicMsgVo = {
      nano_id: nanoid(),
      text_type: MSG_TYPE_GROUP_TEXT,
      raw: currentMessage.trim(),
      recv_user: groupUuid,
      send_user: '',
      timestamp: new Date().getTime(),
    };

    const temp: ChatMessage = {
      from: MessageFrom.Mine,
      text_msg_raw,
      ack: false,
    };

    try {
      await invoke('send_group_text_msg', { textQuicMsg: text_msg_raw });
      onMessageSent(JSON.stringify(temp));
      setMsg('');
    } catch (e) {
      console.log(intl.formatMessage({ id: 'chat.footer.sendFailed' }), e);
      message.error(intl.formatMessage({ id: 'groupChat.sendFailed' }));
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setMsg((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const sendImage = async () => {
    try {
      const filePaths = await selectFile(false, false, [
        { name: 'Images', extensions: await getImageExtensions() },
      ]);

      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
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
        const text_msg_raw: TextQuicMsgVo = {
          nano_id: nanoid(),
          text_type: MSG_TYPE_GROUP_IMAGE,
          raw: filePath,
          recv_user: groupUuid,
          send_user: '',
          timestamp: new Date().getTime(),
        };

        const temp: ChatMessage = {
          from: MessageFrom.Mine,
          text_msg_raw,
          ack: false,
        };

        // 先上屏(展示气泡与上传进度)，再执行发送
        onMessageSent(JSON.stringify(temp));
        onUploadStart?.(text_msg_raw.nano_id);
        try {
          await invoke('send_group_image_msg', { textQuicMsg: text_msg_raw });
        } finally {
          onUploadEnd?.(text_msg_raw.nano_id);
        }
      }
    } catch (e) {
      console.log('发送图片失败', e);
      message.error(intl.formatMessage({ id: 'groupChat.sendImageFailed' }));
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
        const text_msg_raw: TextQuicMsgVo = {
          nano_id: nanoid(),
          text_type: MSG_TYPE_GROUP_FILE,
          raw: filePath,
          recv_user: groupUuid,
          send_user: '',
          timestamp: new Date().getTime(),
        };

        const temp: ChatMessage = {
          from: MessageFrom.Mine,
          text_msg_raw,
          ack: false,
        };

        // 先上屏(展示气泡与上传进度)，再执行发送
        onMessageSent(JSON.stringify(temp));
        onUploadStart?.(text_msg_raw.nano_id);
        try {
          await invoke('send_group_file_msg', { textQuicMsg: text_msg_raw });
        } finally {
          onUploadEnd?.(text_msg_raw.nano_id);
        }
      }
    } catch (e) {
      console.log('发送文件失败', e);
      message.error(intl.formatMessage({ id: 'groupChat.sendFileFailed' }));
      onUploadEnd?.();
    }
  };

  const sendVoice = async (recording: VoiceRecordingResult) => {
    const text_msg_raw: TextQuicMsgVo = {
      nano_id: nanoid(),
      text_type: MSG_TYPE_GROUP_VOICE,
      raw: recording.path,
      recv_user: groupUuid,
      send_user: '',
      timestamp: new Date().getTime(),
    };

    const temp: ChatMessage = {
      from: MessageFrom.Mine,
      text_msg_raw,
      ack: false,
    };

    // 先上屏(展示气泡与上传进度)，再执行发送
    onMessageSent(JSON.stringify(temp));
    onUploadStart?.(text_msg_raw.nano_id);
    try {
      await invoke('send_group_voice_msg', {
        textQuicMsg: text_msg_raw,
        duration: recording.duration,
      });
    } catch (e) {
      console.log('发送群语音失败', e);
      message.error(intl.formatMessage({ id: 'chat.voice.failed' }));
    } finally {
      onUploadEnd?.(text_msg_raw.nano_id);
    }
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
        <div
          className={styles.footerBtn}
          onClick={sendImage}
          title={intl.formatMessage({ id: 'groupChat.sendImage' })}
        >
          <PictureOutlined />
        </div>
        <div
          className={styles.footerBtn}
          onClick={sendFile}
          title={intl.formatMessage({ id: 'groupChat.sendFile' })}
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
      </div>
      <div className={styles.footerMessage}>
        <TextArea
          onPressEnter={sendMessage}
          value={msg}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setMsg(e.target.value)
          }
          className={styles.footerTextArea}
          placeholder={intl.formatMessage({ id: 'groupChat.inputPlaceholder' })}
        />
        <div className={styles.footerSendBtn}>
          <Button type="primary" variant="outlined" onClick={sendMessage}>
            {intl.formatMessage({ id: 'groupChat.send' })}
          </Button>
        </div>
      </div>
      <VoiceRecordModal
        open={showVoiceRecord}
        onCancel={() => setShowVoiceRecord(false)}
        onSend={sendVoice}
      />
    </div>
  );
};

export default React.memo(GroupChatFooter);
