/**
 * 日志面板
 */
import { useIntl } from '@umijs/max';
import { Button } from 'antd';
import React from 'react';
import styles from '../index.less';

export type WebRTCLogLevel = 'log' | 'info' | 'warn' | 'error';

export interface WebRTCLogEntry {
  id: number;
  timestamp: number;
  level: WebRTCLogLevel;
  message: string;
}

interface LogPanelProps {
  logs: WebRTCLogEntry[];
  logContainerRef: React.RefObject<HTMLDivElement>;
  onClear: () => void;
}

const formatLogTime = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(
    d.getMilliseconds(),
  ).padStart(3, '0')}`;
};

const logLevelClass = (level: string) => {
  if (level === 'warn') return styles.logWarn;
  if (level === 'error') return styles.logError;
  return styles.logInfo;
};

const LogPanel: React.FC<LogPanelProps> = ({
  logs,
  logContainerRef,
  onClear,
}) => {
  const intl = useIntl();

  return (
    <div className={styles.logPanel}>
      <div className={styles.logHeader}>
        <span className={styles.logTitle}>
          {intl.formatMessage({ id: 'webrtc.logTitle' })}
        </span>
        <Button size="small" onClick={onClear}>
          {intl.formatMessage({ id: 'webrtc.clearLogs' })}
        </Button>
      </div>
      <div className={styles.logBody} ref={logContainerRef}>
        {logs.length === 0 && (
          <div className={styles.logEmpty}>
            {intl.formatMessage({ id: 'webrtc.logEmpty' })}
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className={styles.logLine}>
            <span className={styles.logTime}>
              {formatLogTime(log.timestamp)}
            </span>
            <span className={`${styles.logLevel} ${logLevelClass(log.level)}`}>
              [{log.level.toUpperCase()}]
            </span>
            <span className={styles.logMessage}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogPanel;
