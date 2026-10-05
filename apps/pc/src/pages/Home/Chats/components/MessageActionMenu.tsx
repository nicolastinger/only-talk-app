import { useIntl } from '@umijs/max';
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './styles/MessageActionMenu.less';

export type MessageAction = 'multi' | 'forward' | 'delete' | 'copy';

interface MessageActionMenuProps {
  x: number;
  y: number;
  canCopy?: boolean;
  onSelect: (action: MessageAction) => void;
  onClose: () => void;
}

const EDGE_PADDING = 8;

const MessageActionMenu: React.FC<MessageActionMenuProps> = ({
  x,
  y,
  canCopy,
  onSelect,
  onClose,
}) => {
  const intl = useIntl();
  const ref = useRef<HTMLDivElement>(null);
  // 文档坐标系（绝对定位基于 body）
  const [pos, setPos] = useState({ left: x, top: y });

  // 挂载后测量尺寸，靠近视口边缘时翻转/收拢，避免溢出
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const rect = el.getBoundingClientRect();
    let left = x + scrollX;
    let top = y + scrollY;

    if (x + rect.width + EDGE_PADDING > window.innerWidth) {
      left = Math.max(scrollX + EDGE_PADDING, x + scrollX - rect.width);
    }
    if (y + rect.height + EDGE_PADDING > window.innerHeight) {
      top = Math.max(scrollY + EDGE_PADDING, y + scrollY - rect.height);
    }
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('contextmenu', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('contextmenu', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const items: { key: MessageAction; label: string }[] = [
    {
      key: 'multi',
      label: intl.formatMessage({ id: 'chat.messageActions.multiSelect' }),
    },
    {
      key: 'forward',
      label: intl.formatMessage({ id: 'chat.messageActions.forward' }),
    },
    {
      key: 'delete',
      label: intl.formatMessage({ id: 'chat.messageActions.delete' }),
    },
  ];
  if (canCopy) {
    items.push({
      key: 'copy',
      label: intl.formatMessage({ id: 'chat.messageActions.copy' }),
    });
  }

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className={styles.item}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </div>
      ))}
    </div>,
    document.body,
  );
};

export default MessageActionMenu;
