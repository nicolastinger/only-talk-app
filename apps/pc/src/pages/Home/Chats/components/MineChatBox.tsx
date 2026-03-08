import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { ChatMessage } from '@workspace/types';
import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/MineChatBox.less';
import { TextBox } from './TextBox';
import { getFiles } from '@workspace/services';

// 图片缓存
const imageCache = new Map<string, string>();

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
  const [loading, setLoading] = useState(false);

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
      // 检查缓存
      if (imageCache.has(icon)) {
        setUserIcon(imageCache.get(icon)!);
        return;
      }
      
      setLoading(true);
      const FileVos = await getFiles(icon);
      const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;
      
      // 存入缓存
      if (tauriFilePath) {
        imageCache.set(icon, tauriFilePath);
      }
      
      setUserIcon(tauriFilePath);
      setLoading(false);
    } catch (error) {
      console.log(error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userInfo?.icon) {
      getUserIcon(userInfo.icon);
    }
  }, [userInfo?.icon])

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
          style={{ opacity: loading ? 0.7 : 1 }}
        />
      </div>
    </div>
  );
};

export default React.memo(MineChatBox);
