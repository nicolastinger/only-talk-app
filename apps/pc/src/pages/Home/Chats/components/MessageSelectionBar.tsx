import { useIntl } from '@umijs/max';
import { Button } from 'antd';
import React from 'react';
import styles from './styles/MessageSelectionBar.less';

interface MessageSelectionBarProps {
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onCancel: () => void;
  onForward: () => void;
  onDelete: () => void;
}

const MessageSelectionBar: React.FC<MessageSelectionBarProps> = ({
  count,
  allSelected,
  onToggleAll,
  onCancel,
  onForward,
  onDelete,
}) => {
  const intl = useIntl();
  return (
    <div className={styles.bar}>
      <span className={styles.info}>
        {intl.formatMessage({ id: 'chat.selection.selected' }, { count })}
      </span>
      <Button type="link" size="small" onClick={onToggleAll}>
        {allSelected
          ? intl.formatMessage({ id: 'chat.selection.unselectAll' })
          : intl.formatMessage({ id: 'chat.selection.selectAll' })}
      </Button>
      <Button type="link" size="small" onClick={onCancel}>
        {intl.formatMessage({ id: 'chat.messageActions.cancel' })}
      </Button>
      <div className={styles.spacer} />
      <Button type="primary" disabled={count === 0} onClick={onForward}>
        {intl.formatMessage({ id: 'chat.messageActions.forward' })}
        {count > 0 ? `(${count})` : ''}
      </Button>
      <Button danger disabled={count === 0} onClick={onDelete}>
        {intl.formatMessage({ id: 'chat.messageActions.delete' })}
        {count > 0 ? `(${count})` : ''}
      </Button>
    </div>
  );
};

export default MessageSelectionBar;
