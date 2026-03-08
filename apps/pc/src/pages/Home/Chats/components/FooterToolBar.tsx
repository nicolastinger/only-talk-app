import { PictureOutlined, SmileOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import React, { useState, useRef, useEffect } from 'react';
import { selectFile } from '@workspace/services';
import styles from './styles/FooterToolBar.less';

interface FooterToolBarProps {
  friendUuid: string;
  onEmojiSelect?: (emoji: string) => void;
}

const EMOJI_LIST = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
  '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐',
  '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
  '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷',
  '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '🤘',
  '❤️', '💔', '💯', '🔥', '⭐', '✨', '💥', '🎉'
];

const FooterToolBar: React.FC<FooterToolBarProps> = ({ friendUuid, onEmojiSelect }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sendImage = async () => {
    const filePaths = await selectFile(false, false);
    if (filePaths && filePaths.length > 0) {
      console.log('Selected image path:', filePaths[0]);
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

  const handleEmojiClick = (emoji: string) => {
    console.log('Selected emoji:', emoji);
    onEmojiSelect?.(emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div className={styles.footerBtnBar}>
      <div className={styles.emojiWrapper} ref={emojiPickerRef}>
        <div className={styles.footerBtn} onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
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
      <div className={styles.footerBtn} onClick={sendImage}>
        <PictureOutlined />
      </div>
      <div className={styles.footerBtn} onClick={sendRequestToP2p}>
        <VideoCameraOutlined />
      </div>
    </div>
  );
};

export default React.memo(FooterToolBar);
