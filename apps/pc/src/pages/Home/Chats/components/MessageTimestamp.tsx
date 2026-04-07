import { formatMessageTime } from '@/utils/format';
import React from 'react';
import styles from './styles/MessageTimestamp.less';

interface MessageTimestampProps {
  timestamp: number;
  className?: string;
  style?: React.CSSProperties;
}

const MessageTimestamp: React.FC<MessageTimestampProps> = ({
  timestamp,
  className,
  style,
}) => {
  return (
    <div className={`${styles.timestamp} ${className || ''}`} style={style}>
      <span className={styles.timestampText}>
        {formatMessageTime(timestamp)}
      </span>
    </div>
  );
};

export default React.memo(MessageTimestamp);
