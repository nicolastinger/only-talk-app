import React from 'react';
import styles from './styles/TopBar.less';

interface ChatTopBarProps {
  title: string;
}

const ChatTopBar: React.FC<ChatTopBarProps> = (props: ChatTopBarProps) => {
  const { title } = props;

  return (
    <div className={styles.container}>
      <div className={styles.leftContainer}>{title}</div>
      <div className={styles.rightContainer}></div>
    </div>
  );
};

export default ChatTopBar;
