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
  const formatTimestamp = (ts: number): string => {
    const now = new Date();
    const date = new Date(ts);
    
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDay = now.getDate();
    
    const msgYear = date.getFullYear();
    const msgMonth = date.getMonth();
    const msgDay = date.getDate();
    
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    const isToday = nowYear === msgYear && nowMonth === msgMonth && nowDay === msgDay;
    
    if (isToday) {
      return `${hours}:${minutes}`;
    }
    
    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= 30) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

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
      {formatTimestamp(timestamp)}
    </div>
  );
};

export default React.memo(MessageTimestamp);
