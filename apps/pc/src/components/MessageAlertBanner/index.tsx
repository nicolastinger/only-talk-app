import { DEFAULT_ICON } from '@/constants';
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { history } from '@umijs/max';
import { subscribe } from '@workspace/services';
import { Avatar } from 'antd';
import { useEffect, useRef, useState } from 'react';

/**
 * 新消息横幅（仅桌面端弹系统通知外的“可点击跳转”提示）。
 *
 * - 维护 app_foreground 标志（前台=1/后台=0），供 Rust 端决定“发系统通知 or 发横幅事件”。
 * - 监听 Rust 端 alert_incoming_message 事件：前台时收到非当前会话的新消息，
 *   在此弹出一个可点击的迷你横幅，点击后跳转到对应会话窗口。
 */
interface AlertPayload {
  is_group: boolean;
  target: string;
  title: string;
  /** 发送者展示名(单聊=好友名；群聊=群昵称) */
  sender_name?: string;
  /** 发送者头像 biz_id */
  icon?: string;
  body: string;
}

const AUTO_HIDE_MS = 6000;

const setForeground = (value: '1' | '0') => {
  invoke('add_user_map', { map: { app_foreground: value } }).catch(() => {
    // 纯浏览器/开发环境无 Tauri，忽略
  });
};

export default function MessageAlertBanner() {
  const [alert, setAlert] = useState<AlertPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 前台状态：跟随窗口焦点 / 页面可见性
  useEffect(() => {
    setForeground('1');
    const onFocus = () => setForeground('1');
    const onBlur = () => setForeground('0');
    const onVisibility = () => {
      setForeground(document.visibilityState === 'visible' ? '1' : '0');
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // 监听新消息提醒
  useEffect(() => {
    const off = subscribe('alert_incoming_message', (payloadRaw) => {
      try {
        const payload: AlertPayload =
          typeof payloadRaw === 'string'
            ? JSON.parse(payloadRaw)
            : (payloadRaw as AlertPayload);
        if (!payload?.target) return;
        setAlert(payload);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setAlert(null), AUTO_HIDE_MS);
      } catch (e) {
        console.error('解析新消息提醒失败', e);
      }
    });
    return () => {
      off();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 解析发送者头像(biz_id -> 本地可访问 url)
  const { avatarMap } = useAvatarMap([alert?.icon]);
  const avatarUrl = alert?.icon ? avatarMap.get(alert.icon) : undefined;

  if (!alert) return null;

  const openSession = () => {
    const path = alert.is_group
      ? `/home/chats/group-chat?groupId=${encodeURIComponent(alert.target)}`
      : `/home/chats/chat?currentFriend=${encodeURIComponent(alert.target)}`;
    history.push(path);
    setAlert(null);
  };

  const displayName = alert.sender_name || alert.title;
  const showGroupName =
    alert.is_group && !!alert.title && alert.title !== displayName;

  return (
    <div
      onClick={openSession}
      onMouseEnter={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
      }}
      onMouseLeave={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setAlert(null), AUTO_HIDE_MS);
      }}
      style={{
        position: 'fixed',
        top: 56,
        right: 16,
        zIndex: 9999,
        width: 320,
        maxWidth: 'calc(100vw - 32px)',
        padding: '12px 14px',
        borderRadius: 10,
        background: '#ffffff',
        boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
        border: '1px solid #e6e6e6',
        cursor: 'pointer',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <Avatar
        size={40}
        shape="square"
        icon={<UserOutlined />}
        src={avatarUrl || DEFAULT_ICON}
        style={{ flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#111',
            wordBreak: 'break-word',
          }}
        >
          {displayName}
          {showGroupName && (
            <span style={{ color: '#999', fontWeight: 400 }}>
              {' · '}
              {alert.title}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#666',
            marginTop: 2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {alert.body}
        </div>
      </div>
      <span
        style={{ color: '#bbb', fontSize: 14, lineHeight: 1 }}
        onClick={(e) => {
          e.stopPropagation();
          setAlert(null);
        }}
      >
        ✕
      </span>
    </div>
  );
}
