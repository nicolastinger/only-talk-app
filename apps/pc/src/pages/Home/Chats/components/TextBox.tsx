import { TextMsgRaw } from '@workspace/types/src/backend';
import React from 'react';
import styles from './styles/TextBox.less';

export const TextBox: React.FC<string> = (raw: string) => {
  try {
    const msg = JSON.parse(raw) as TextMsgRaw;
    return <div className={styles.container}>{msg.text}</div>;
  } catch (error) {
    console.error('TextBox JSON解析失败:', error, '原始数据:', raw);
    return <div className={styles.container}>[消息解析失败]</div>;
  }
};
