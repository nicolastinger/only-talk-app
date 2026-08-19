import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import {
  CloseOutlined,
  DownOutlined,
  LoadingOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { ChatRecordSend } from '@workspace/types';
import { message } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import resendSvg from '@/assets/svg/resend.svg';
import styles from './styles/PendingSendBar.less';

/** 默认/最小高度 */
export const PENDING_BAR_HEIGHT = 48;
/** 拖拽可展开的最大高度 */
export const PENDING_BAR_MAX_HEIGHT = 160;
/** 折叠后的窄条高度 */
export const PENDING_BAR_COLLAPSED_HEIGHT = 22;

interface PendingSendBarProps {
  friendUuid: string;
  /** 父页面自增信号，变化时重新拉取（201 ACK / 发送新消息后触发） */
  refreshSignal: number;
  /** 可见性变化通知（记录清空时父页面回收高度） */
  onVisibleChange: (visible: boolean) => void;
  /** 高度变化通知（拖拽拉伸 / 折叠展开），父页面联动消息区高度 */
  onHeightChange: (height: number) => void;
}

/** 将 send 表 raw 解析为可展示的摘要文本 */
const formatRaw = (record: ChatRecordSend): string => {
  try {
    switch (record.text_type) {
      case 1: {
        const parsed = JSON.parse(record.raw);
        return parsed.text ?? record.raw;
      }
      case 2:
        return '[图片]';
      case 3: {
        const parsed = JSON.parse(record.raw);
        return parsed.file_name ?? '[文件]';
      }
      case 100:
        return '[WebRTC信令]';
      default:
        return record.raw;
    }
  } catch {
    return record.raw;
  }
};

const PendingSendBar: React.FC<PendingSendBarProps> = ({
  friendUuid,
  refreshSignal,
  onVisibleChange,
  onHeightChange,
}) => {
  const intl = useIntl();
  const [pendingList, setPendingList] = useState<ChatRecordSend[]>([]);
  const [actingId, setActingId] = useState('');
  const [height, setHeight] = useState(PENDING_BAR_HEIGHT);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ y: 0, h: PENDING_BAR_HEIGHT });
  // 操作兜底计时器：invoke 异常挂起时强制解禁，避免按钮一直处于禁用状态
  const actingTimerRef = useRef<number>();

  // 统一的操作入口：置位 actingId → 执行 → 解禁；异常/超时兜底保证界面不卡死
  const runAction = useCallback(async (sendId: string, action: () => Promise<void>) => {
    setActingId(sendId);
    window.clearTimeout(actingTimerRef.current);
    // 兜底：15 秒后无论 invoke 是否返回都强制解禁（正常路径后端 10 秒锁超时会返回错误）
    actingTimerRef.current = window.setTimeout(() => {
      setActingId('');
    }, 15000);
    try {
      await action();
    } finally {
      window.clearTimeout(actingTimerRef.current);
      setActingId('');
    }
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(actingTimerRef.current);
  }, []);

  const fetchList = useCallback(async (): Promise<ChatRecordSend[]> => {
    try {
      const list = await invoke<ChatRecordSend[]>('get_pending_send_records', {
        recvUser: friendUuid,
      });
      setPendingList(list);
      return list;
    } catch (e) {
      console.log('获取待发送记录失败', e);
      return [];
    }
  }, [friendUuid]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshSignal]);

  // 队列未清空时每 1s 轮询一次，直到记录全部消失（发送完成/忽略/清空）
  useEffect(() => {
    if (pendingList.length === 0) return;
    const timer = setInterval(() => {
      fetchList();
    }, 1000);
    return () => clearInterval(timer);
  }, [pendingList.length, fetchList]);

  useEffect(() => {
    onVisibleChange(pendingList.length > 0);
  }, [pendingList, onVisibleChange]);

  // 折叠/拉伸后的实际占位高度通知父页面
  useEffect(() => {
    onHeightChange(collapsed ? PENDING_BAR_COLLAPSED_HEIGHT : height);
  }, [collapsed, height, onHeightChange]);

  const sendingList = useMemo(
    () => pendingList.filter((r) => r.send_status === 0 || r.send_status === 1),
    [pendingList],
  );
  const failedList = useMemo(
    () => pendingList.filter((r) => r.send_status === 2),
    [pendingList],
  );

  // 顶部拖拽手柄：向上拖变高，向下拖变矮，window 级监听保证拖出组件也不断
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
    dragStartRef.current = { y: e.clientY, h: height };
    const onMove = (ev: PointerEvent) => {
      const { y, h } = dragStartRef.current;
      const next = Math.max(
        PENDING_BAR_HEIGHT,
        Math.min(PENDING_BAR_MAX_HEIGHT, h + (y - ev.clientY)),
      );
      setHeight(next);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (pendingList.length === 0) return null;

  // 折叠态：窄条 + 失败计数徽标，点击整条展开
  if (collapsed) {
    return (
      <div
        className={styles.collapsedBar}
        onClick={() => setCollapsed(false)}
        title={intl.formatMessage({ id: 'chat.pendingBar.expand' })}
      >
        <span className={styles.collapsedInfo}>
          <span className={styles.collapsedDot} />
          {intl.formatMessage({ id: 'chat.pendingBar.title' })}
          {failedList.length > 0 && (
            <span className={styles.collapsedBadge}>{failedList.length}</span>
          )}
        </span>
        <span className={styles.collapsedExpand}>
          <UpOutlined />
        </span>
      </div>
    );
  }

  const handleRetry = (sendId: string) =>
    runAction(sendId, async () => {
      try {
        await invoke('retry_send_msg', { sendId });
        const list = await fetchList();
        // 重发后仍处于失败态：网络不通，发送再次失败
        const stillFailed = list.some(
          (r) => r.send_id === sendId && r.send_status === 2,
        );
        if (stillFailed) {
          message.warning(intl.formatMessage({ id: 'chat.pendingBar.resendFailed' }));
        }
      } catch (e) {
        console.log(intl.formatMessage({ id: 'chat.pendingBar.resendFailed' }), e);
        message.error(intl.formatMessage({ id: 'chat.pendingBar.resendFailed' }));
        // 命令失败（如锁超时）也刷新一次，保证界面状态与后端一致
        await fetchList();
      }
    });

  const handleIgnore = (sendId: string) =>
    runAction(sendId, async () => {
      try {
        await invoke('ignore_send_msg', { sendId });
        await fetchList();
      } catch (e) {
        console.log(intl.formatMessage({ id: 'chat.pendingBar.ignoreFailed' }), e);
        message.error(intl.formatMessage({ id: 'chat.pendingBar.ignoreFailed' }));
      }
    });

  return (
    <div
      className={`${styles.pendingBar}${dragging ? ` ${styles.dragging}` : ''}`}
      style={{ height }}
    >
      <div className={styles.dragHandle} onPointerDown={handleDragStart} />
      <div className={`${styles.pane} ${styles.paneSending}`}>
        <div className={styles.paneTitle}>
          {intl.formatMessage({ id: 'chat.pendingBar.sending' })}
        </div>
        {sendingList.map((record) => (
          <div className={`${styles.item} ${styles.sendingItem}`} key={record.send_id}>
            {record.send_status === 1 ? (
              <LoadingOutlined className={styles.itemIcon} />
            ) : (
              <span className={styles.queuedLabel}>
                {intl.formatMessage({ id: 'chat.pendingBar.queued' })}
              </span>
            )}
            <span className={styles.itemText} title={formatRaw(record)}>
              {formatRaw(record)}
            </span>
          </div>
        ))}
      </div>
      <div className={`${styles.pane} ${styles.paneFailed}`}>
        <div className={styles.paneTitle}>
          {intl.formatMessage({ id: 'chat.pendingBar.failed' })}
        </div>
        {failedList.map((record) => {
          const isActing = actingId === record.send_id;
          return (
            <div
              className={`${styles.item} ${styles.failedItem}${isActing ? ` ${styles.actingItem}` : ''}`}
              key={record.send_id}
            >
              <span className={styles.itemText} title={formatRaw(record)}>
                {formatRaw(record)}
              </span>
              <button
                className={`${styles.actionBtn} ${styles.resendBtn}`}
                title={intl.formatMessage({ id: 'chat.pendingBar.resend' })}
                disabled={isActing}
                onClick={() => handleRetry(record.send_id)}
              >
                {isActing ? (
                  <LoadingOutlined className={styles.actionIcon} />
                ) : (
                  <img src={resendSvg} alt="resend" className={styles.actionIcon} />
                )}
              </button>
              <button
                className={`${styles.actionBtn} ${styles.ignoreBtn}`}
                title={intl.formatMessage({ id: 'chat.pendingBar.ignore' })}
                disabled={isActing}
                onClick={() => handleIgnore(record.send_id)}
              >
                <CloseOutlined className={styles.actionIcon} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className={styles.collapseBtn}
        title={intl.formatMessage({ id: 'chat.pendingBar.collapse' })}
        onClick={() => setCollapsed(true)}
      >
        <DownOutlined className={styles.collapseIcon} />
      </button>
    </div>
  );
};

export default React.memo(PendingSendBar);
