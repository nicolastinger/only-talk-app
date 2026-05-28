import React from 'react';

type TextMsgRaw = {
  text?: string;
  content?: string;
};

export const TextBox = (raw: string): React.ReactNode => {
  if (!raw) {
    return '[空消息]';
  }

  try {
    const parsed: TextMsgRaw = JSON.parse(raw);
    const text = parsed.text || parsed.content || raw;
    return (
      <span
        style={{
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}
      >
        {text}
      </span>
    );
  } catch {
    return (
      <span
        style={{
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}
      >
        {raw}
      </span>
    );
  }
};

export default TextBox;