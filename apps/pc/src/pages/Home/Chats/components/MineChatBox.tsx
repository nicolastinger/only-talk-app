import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { ChatMessage, ImageRecord } from '@workspace/types';
import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/MineChatBox.less';
import { TextBox } from './TextBox';
import { getChatFileByBizId, getFiles } from '@workspace/services';
import ChatImage from './ChatImage';

const imageCache = new Map<string, string>();

type MineChatBoxProps = {
  msg: ChatMessage;
  isAck: boolean | undefined;
  icon?: string;
  allImageBizIds?: string[];
  currentImageIndex?: number;
  currentBizId?: string;
  bizIdToUrlMap?: Map<string, string>;
};

const MineChatBox: React.FC<MineChatBoxProps> = (props: MineChatBoxProps) => {
  const {
    msg: {
      text_msg_raw: { raw, text_type },
    },
    isAck = true,
    icon,
    allImageBizIds,
    currentImageIndex,
    currentBizId,
    bizIdToUrlMap,
  } = props;
  const [userIcon, setUserIcon] = React.useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (text_type === 2) {
      try {
        const imageRecord: ImageRecord = JSON.parse(raw);
        const bizId = imageRecord.biz_id;
        console.log('MineChatBox - Loading image with bizId:', bizId);
        
        if (imageCache.has(bizId)) {
          console.log('MineChatBox - Image found in cache');
          setImageUrl(imageCache.get(bizId)!);
          if (bizIdToUrlMap) {
            bizIdToUrlMap.set(bizId, imageCache.get(bizId)!);
          }
          return;
        }
        
        setLoading(true);
        getChatFileByBizId(bizId).then((files) => {
          console.log('MineChatBox - Files returned:', files);
          if (files && files.length > 0) {
            const tauriFilePath = files[0].tauri_file_path;
            console.log('MineChatBox - Tauri file path:', tauriFilePath);
            if (tauriFilePath) {
              imageCache.set(bizId, tauriFilePath);
              setImageUrl(tauriFilePath);
              if (bizIdToUrlMap) {
                bizIdToUrlMap.set(bizId, tauriFilePath);
              }
            } else {
              console.error('MineChatBox - Tauri file path is empty');
            }
          } else {
            console.error('MineChatBox - No files returned');
          }
          setLoading(false);
        }).catch((error) => {
          console.error('MineChatBox - Error loading image:', error);
          setLoading(false);
        });
      } catch (error) {
        console.error('MineChatBox - Error parsing image record:', error);
      }
    }
  }, [raw, text_type, bizIdToUrlMap]);

  const renderMessage = (message: string) => {
    switch (text_type) {
      case 1:
        return TextBox(message);
      case 2:
        return (
          <ChatImage
            src={imageUrl}
            loading={loading}
            allImageBizIds={allImageBizIds}
            currentIndex={currentImageIndex}
            bizIdToUrlMap={bizIdToUrlMap}
          />
        );
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
