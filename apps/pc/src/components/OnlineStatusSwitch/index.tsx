import { PRESENCE_META } from '@/components/PresenceTag';
import { isPresenceExpired, usePresenceStore } from '@/store/presence';
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { PresenceMode } from '@workspace/types';
import { Button, Input, message, Popover } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './index.less';

/** 可选状态; online 表示"无状态/清除", 与在线离线无关 */
const STATUS_OPTIONS: PresenceMode[] = [
  'online',
  'busy',
  'away',
  'studying',
  'working',
  'custom',
];

/** 无状态(在线)用中性绿; 其余颜色来自 PRESENCE_META */
const IDLE_COLOR = '#52c41a';
/** 与服务端 USER_PRESENCE_TTL_SECS 保持一致, 仅用于展示剩余时间进度 */
const PRESENCE_TTL_MS = 48 * 60 * 60 * 1000;
const CUSTOM_MAX_LEN = 32;

/** hex 转 rgba(用于软阴影/描边, 避免依赖 color-mix) */
const alpha = (hex: string, value: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${value})`;
};

/** 允许在 style 上挂 CSS 自定义属性 */
type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

const OnlineStatusSwitch = () => {
  const intl = useIntl();
  const myPresence = usePresenceStore((state) => state.myPresence);
  const loadMyPresence = usePresenceStore((state) => state.loadMyPresence);
  const updateMyPresence = usePresenceStore((state) => state.updateMyPresence);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [customText, setCustomText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMyPresence();
  }, [loadMyPresence]);

  const active =
    !!myPresence &&
    myPresence.mode !== 'online' &&
    !isPresenceExpired(myPresence);
  const currentMode: PresenceMode =
    active && myPresence ? myPresence.mode : 'online';
  const currentColor =
    currentMode === 'online' ? IDLE_COLOR : PRESENCE_META[currentMode].color;

  const labelOf = (mode: PresenceMode): string => {
    if (mode === 'online') {
      return intl.formatMessage({ id: 'onlineStatus.online' });
    }
    if (mode === 'custom') {
      return active && myPresence?.text
        ? myPresence.text
        : intl.formatMessage({ id: 'onlineStatus.custom' });
    }
    return intl.formatMessage({ id: PRESENCE_META[mode].labelId });
  };
  const currentLabel = labelOf(currentMode);

  const apply = async (mode: PresenceMode, text?: string) => {
    try {
      await updateMyPresence(mode, text);
    } catch (e) {
      console.error('[presence] 设置状态失败', e);
      message.error(intl.formatMessage({ id: 'onlineStatus.setFailed' }));
      throw e;
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setEditing(false);
  };

  const handleSelect = (mode: PresenceMode) => {
    if (mode === 'custom') {
      setCustomText(myPresence?.mode === 'custom' ? myPresence.text || '' : '');
      setEditing(true);
      return;
    }
    handleOpenChange(false);
    apply(mode).catch(() => {});
  };

  const submitCustom = async () => {
    const text = customText.trim();
    if (!text) {
      message.warning(intl.formatMessage({ id: 'onlineStatus.customEmpty' }));
      return;
    }
    setSaving(true);
    try {
      await apply('custom', text);
      handleOpenChange(false);
    } catch {
      // 错误已由 apply 统一提示
    } finally {
      setSaving(false);
    }
  };

  // 剩余时长: 服务端 48h TTL, 这里只做可视化(不参与任何判在线逻辑)
  const remainingMs =
    active && myPresence ? Math.max(0, myPresence.expires_at - Date.now()) : 0;
  const remainingHours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
  const remainingPercent = Math.min(
    100,
    Math.max(0, (remainingMs / PRESENCE_TTL_MS) * 100),
  );

  const tooltip =
    active && remainingMs > 0
      ? `${currentLabel} · ${intl.formatMessage(
          { id: 'onlineStatus.remainingHours' },
          { hours: remainingHours },
        )}`
      : intl.formatMessage({ id: 'onlineStatus.title' });

  const panel = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>
          {intl.formatMessage({ id: 'onlineStatus.title' })}
        </span>
        {active && (
          <span
            className={styles.currentChip}
            style={{
              color: currentColor,
              background: alpha(currentColor, 0.12),
            }}
          >
            {currentLabel}
          </span>
        )}
      </div>

      {editing ? (
        <div className={styles.editor}>
          <div className={styles.editorField}>
            <Input
              autoFocus
              variant="borderless"
              value={customText}
              maxLength={CUSTOM_MAX_LEN}
              placeholder={intl.formatMessage({
                id: 'onlineStatus.customPlaceholder',
              })}
              onChange={(e) => setCustomText(e.target.value)}
              onPressEnter={submitCustom}
            />
          </div>
          <div className={styles.editorBar}>
            <span className={styles.counter}>
              {customText.length}/{CUSTOM_MAX_LEN}
            </span>
            <div className={styles.editorActions}>
              <Button
                size="small"
                type="text"
                onClick={() => setEditing(false)}
              >
                {intl.formatMessage({ id: 'common.cancel' })}
              </Button>
              <Button
                size="small"
                type="primary"
                loading={saving}
                onClick={submitCustom}
              >
                {intl.formatMessage({ id: 'common.save' })}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {STATUS_OPTIONS.map((mode) => {
            const meta = mode === 'online' ? null : PRESENCE_META[mode];
            const color = meta?.color ?? IDLE_COLOR;
            const selected = currentMode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={selected}
                className={`${styles.cell} ${
                  selected ? styles.cellActive : ''
                }`}
                style={
                  {
                    '--cell-soft': alpha(color, 0.12),
                    '--cell-ring': alpha(color, 0.32),
                    '--cell-glow': alpha(color, 0.18),
                  } as CSSVars
                }
                onClick={() => handleSelect(mode)}
              >
                <span className={styles.cellIcon} style={{ color }}>
                  {meta?.icon ?? <CheckCircleOutlined />}
                </span>
                <span className={styles.cellLabel}>{labelOf(mode)}</span>
                {selected && (
                  <CheckCircleFilled
                    className={styles.cellCheck}
                    style={{ color }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.panelFooter}>
        <div className={styles.footerRow}>
          <span className={styles.footerText}>
            {intl.formatMessage({ id: 'onlineStatus.expireShort' })}
          </span>
          {active && remainingMs > 0 && (
            <span
              className={styles.footerRemain}
              style={{ color: currentColor }}
            >
              {intl.formatMessage(
                { id: 'onlineStatus.remainingHours' },
                { hours: remainingHours },
              )}
            </span>
          )}
        </div>
        {active && (
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{
                width: `${remainingPercent}%`,
                background: currentColor,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      content={panel}
      styles={{
        body: { padding: 0, background: 'transparent', boxShadow: 'none' },
      }}
    >
      <button
        type="button"
        title={tooltip}
        aria-label={tooltip}
        aria-expanded={open}
        className={`${styles.trigger} ${active ? styles.triggerActive : ''} ${
          open ? styles.triggerOpen : ''
        }`}
        style={
          active
            ? ({
                '--trigger-soft': alpha(currentColor, 0.12),
                '--trigger-ring': alpha(currentColor, 0.32),
                '--trigger-hover': alpha(currentColor, 0.2),
              } as CSSVars)
            : undefined
        }
      >
        <span
          className={`${styles.dot} ${active ? '' : styles.dotIdle}`}
          style={
            active
              ? {
                  background: currentColor,
                  boxShadow: `0 0 0 3px ${alpha(currentColor, 0.16)}`,
                }
              : undefined
          }
        />
        <span className={styles.triggerLabel}>{currentLabel}</span>
        <DownOutlined
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
      </button>
    </Popover>
  );
};

export default OnlineStatusSwitch;
