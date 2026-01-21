import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { ChatMessage } from '@/types/user/common';
import React, { useEffect, useRef } from 'react';
import styles from './styles/MineChatBox.less';
import { TextBox } from './TextBox';
import { getImageFiles } from '@/services/FileService';

type MineChatBoxProps = {
  msg: ChatMessage;
  isAck: boolean | undefined;
  icon?: string;
};

const MineChatBox: React.FC<MineChatBoxProps> = (props: MineChatBoxProps) => {
  const {
    msg: {
      text_msg_raw: { raw, text_type },
    },
    isAck = true,
    icon
  } = props;
  const [userIcon, setUserIcon] = React.useState<string | null>(null);

  const userInfo = useBearStore((state) => state.userInfo);
  // 初始化ackFlag
  const [ackFlag, setAckFlag] = React.useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null); // 使用 ref 保持定时器引用

  useEffect(() => {
    // 清理上一次的定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // 未收到确认时的处理逻辑
    if (isAck !== undefined && !isAck) {
      // 设置 10 秒超时标记
      timerRef.current = setTimeout(() => {
        setAckFlag(1);
      }, 10000);
    }
    // 确认成功时的处理逻辑
    else if (isAck !== undefined && isAck) {
      setAckFlag(101);
    }

    // 清理函数：组件卸载或依赖项变化时执行
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAck]); // 明确依赖项

  // 获取用户头像
  const getUserIcon = async (icon: string) => {
    try {
      const FileVos = await getImageFiles(icon);
      setUserIcon(FileVos?.[0]?.blob_url || null);
      console.log('用户信息', userInfo);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getUserIcon(userInfo?.icon || '');
  }, [userInfo])

  const renderMessage = (message: string) => {
    switch (text_type) {
      case 1:
        return TextBox(message);
      default:
        return TextBox(message);
    }
  };

  const renderAck = () => {
    return <div>{ackFlag === 1 && <div>发送失败</div>}</div>;
  };

  return (
    <div className={styles.container}>
      {renderAck()}
      <div className={styles.chatContainer}>{renderMessage(raw)}</div>
      <div className={styles.userIcon}>
        <img
          src={userIcon || DEFAULT_ICON}
          width={40}
          height={40}
          className={styles.imgItem}
          alt="icon"
        />
      </div>
    </div>
  );
};

export default React.memo(MineChatBox);
