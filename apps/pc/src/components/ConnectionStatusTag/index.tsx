import { useIntl } from '@umijs/max';
import type { StatusTagState } from '@/hooks/useQuicDisconnect';
import styles from './index.less';

interface ConnectionStatusTagProps {
  statusTag: StatusTagState | null;
}

const ConnectionStatusTag = ({ statusTag }: ConnectionStatusTagProps) => {
  const intl = useIntl();

  if (!statusTag) return null;

  const textMap: Record<string, string> = {
    offline: intl.formatMessage({ id: 'homeLayout.connOffline' }),
    reconnecting: intl.formatMessage({ id: 'homeLayout.connReconnecting' }),
    online: intl.formatMessage({ id: 'homeLayout.connOnline' }),
  };

  return (
    <div className={`${styles.statusTag} ${styles[statusTag]}`}>
      {statusTag === 'reconnecting' && <span className={styles.spinner} />}
      <span>{textMap[statusTag]}</span>
    </div>
  );
};

export default ConnectionStatusTag;