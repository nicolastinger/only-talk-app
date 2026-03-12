import React from 'react';
import styles from './styles/TextBox.less';
import { TextMsgRaw } from '@workspace/types/src/backend';

export const TextBox: React.FC<string> = (raw: string) => {
  const msg = JSON.parse(raw) as TextMsgRaw;
  return <div className={styles.container}>{msg.text}</div>;  
};
