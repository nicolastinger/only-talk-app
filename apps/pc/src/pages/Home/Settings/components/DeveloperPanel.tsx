import { useIntl } from '@umijs/max';
import { invoke } from '@tauri-apps/api/core';
import { SyncBatchView, SyncTaskItem } from '@workspace/types';
import { Button, Card, Collapse, Empty, Spin, Tag, Tabs, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;

/** 会话追平状态(与 src-tauri/entity/sync_task.rs 对齐) */
const STATUS_SUCCESS = 2;
const STATUS_FAILED = 3;

const formatTime = (ms: number): string => {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
};

const SyncTaskView = () => {
  const intl = useIntl();
  const [batches, setBatches] = useState<SyncBatchView[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await invoke<SyncBatchView[]>('get_sync_history');
      setBatches(result || []);
    } catch (error) {
      console.error('获取同步任务记录失败:', error);
      message.error(intl.formatMessage({ id: 'settings.developerPanel.loadFailed' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusTag = (task: SyncTaskItem) => {
    if (task.status === STATUS_SUCCESS) {
      return <Tag color="success">{intl.formatMessage({ id: 'settings.developerPanel.successStatus' })}</Tag>;
    }
    if (task.status === STATUS_FAILED) {
      return <Tag color="error">{intl.formatMessage({ id: 'settings.developerPanel.failedStatus' })}</Tag>;
    }
    return <Tag>{task.status}</Tag>;
  };

  return (
    <div>
      <div className={styles.syncToolbar}>
        <Button type="primary" size="small" loading={loading} onClick={load}>
          {intl.formatMessage({ id: 'settings.developerPanel.refresh' })}
        </Button>
      </div>
      <Spin spinning={loading}>
        {batches.length === 0 ? (
          <Empty description={intl.formatMessage({ id: 'settings.developerPanel.empty' })} />
        ) : (
          <Collapse
            defaultActiveKey={[String(batches[0]?.batch_id)]}
            items={batches.map((batch) => ({
              key: String(batch.batch_id),
              label: (
                <span className={styles.syncBatchLabel}>
                  <Text>
                    {intl.formatMessage({ id: 'settings.developerPanel.batch' })} {formatTime(batch.batch_id)}
                  </Text>
                  <Tag color="blue">
                    {intl.formatMessage({ id: 'settings.developerPanel.total' })} {batch.total}
                  </Tag>
                  <Tag color="green">
                    {intl.formatMessage({ id: 'settings.developerPanel.success' })} {batch.success}
                  </Tag>
                  <Tag color="red">
                    {intl.formatMessage({ id: 'settings.developerPanel.failed' })} {batch.failed}
                  </Tag>
                </span>
              ),
              children:
                batch.tasks.length === 0 ? (
                  <Text type="secondary">
                    {intl.formatMessage({ id: 'settings.developerPanel.noTask' })}
                  </Text>
                ) : (
                  batch.tasks.map((task) => (
                    <div key={task.id} className={styles.syncTaskRow}>
                      <div className={styles.syncTaskMain}>
                        <Text className={styles.syncTaskSession} ellipsis={{ tooltip: task.session_uuid }}>
                          {task.session_uuid}
                        </Text>
                        {statusTag(task)}
                      </div>
                      <div className={styles.syncTaskMeta}>
                        <Text type="secondary">
                          {intl.formatMessage({ id: 'settings.developerPanel.newCount' })} {task.new_count}
                        </Text>
                        <Text type="secondary">
                          {intl.formatMessage({ id: 'settings.developerPanel.batches' })} {task.batches}
                        </Text>
                      </div>
                      {task.status === STATUS_FAILED && task.last_error && (
                        <div className={styles.syncTaskError}>
                          <Text type="danger" ellipsis={{ tooltip: task.last_error }}>
                            {task.last_error}
                          </Text>
                        </div>
                      )}
                    </div>
                  ))
                ),
            }))}
          />
        )}
      </Spin>
    </div>
  );
};

const DeveloperPanel = () => {
  const intl = useIntl();
  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.developerPanel.title' })}
      </Title>
      <Card className={styles.settingCard}>
        <Tabs
          defaultActiveKey="sync"
          items={[
            {
              key: 'sync',
              label: intl.formatMessage({ id: 'settings.developerPanel.syncTab' }),
              children: <SyncTaskView />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DeveloperPanel;