import React from 'react';

export const TextBox: React.FC<string> = (msg: string) => {

  return (
    <div>
      { msg }
    </div>
  )
};