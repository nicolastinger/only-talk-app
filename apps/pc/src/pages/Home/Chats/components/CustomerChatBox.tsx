import { ChatMessage } from '@workspace/types';
import React from 'react';
import styles from './styles/CustomerChatBox.less';

const CustomerChatBox: React.FC<ChatMessage> = (props: ChatMessage) => {
  const {
    text_msg_raw: { raw, text_type },
    img,
  } = props;
  return (
    <div className={styles.container}>
      <div className={styles.userIcon}>
        <img
          src={
            img ||
            'https://pic3.zhimg.com/v2-f971a87263e64dc9f9cf0b35f2d48d62_b.jpg?consumer=ZHI_MENG'
          }
          width={40}
          height={40}
          className={styles.imgItem}
          alt="123"
        />
      </div>
      <div className={styles.chatContainer}>{raw}</div>
    </div>
  );
};

export default CustomerChatBox;
