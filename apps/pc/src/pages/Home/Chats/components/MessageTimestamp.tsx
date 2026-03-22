import { formatMessageTime } from '@/utils/format';
import React from 'react';

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
    <div
      className={className}
      style={{
        textAlign: 'center',
        fontSize: '12px',
        color: '#999',
        margin: '10px 0',
        ...style,
      }}
    >
      {formatMessageTime(timestamp)}
    </div>
  );
};

export default React.memo(MessageTimestamp);
