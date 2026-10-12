import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import {
  AppLog,
  LOG_LEVEL_ERROR,
  LOG_LEVEL_INFO,
  LOG_LEVEL_WARN,
  LogFileContent,
  LogFileInfo,
  LogPage,
  SyncBatchView,
  SyncTaskItem,
} from '@workspace/types';
import {
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { ColumnsType } from 'antd/es/table';
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

const formatSize = (size: number): string => {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(2)}MB`;
};

const levelMeta: Record<number, { text: string; color: string }> = {
  0: { text: 'DEBUG', color: 'default' },
  [LOG_LEVEL_INFO]: { text: 'INFO', color: 'blue' },
  [LOG_LEVEL_WARN]: { text: 'WARN', color: 'orange' },
  [LOG_LEVEL_ERROR]: { text: 'ERROR', color: 'red' },
};

const levelText = (level: number) => levelMeta[level]?.text ?? `L${level}`;
const levelColor = (level: number) => levelMeta[level]?.color ?? 'default';

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
      message.error(
        intl.formatMessage({ id: 'settings.developerPanel.loadFailed' }),
      );
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
      return (
        <Tag color="success">
          {intl.formatMessage({ id: 'settings.developerPanel.successStatus' })}
        </Tag>
      );
    }
    if (task.status === STATUS_FAILED) {
      return (
        <Tag color="error">
          {intl.formatMessage({ id: 'settings.developerPanel.failedStatus' })}
        </Tag>
      );
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
          <Empty
            description={intl.formatMessage({
              id: 'settings.developerPanel.empty',
            })}
          />
        ) : (
          <Collapse
            defaultActiveKey={[String(batches[0]?.batch_id)]}
            items={batches.map((batch) => ({
              key: String(batch.batch_id),
              label: (
                <span className={styles.syncBatchLabel}>
                  <Text>
                    {intl.formatMessage({
                      id: 'settings.developerPanel.batch',
                    })}{' '}
                    {formatTime(batch.batch_id)}
                  </Text>
                  <Tag color="blue">
                    {intl.formatMessage({
                      id: 'settings.developerPanel.total',
                    })}{' '}
                    {batch.total}
                  </Tag>
                  <Tag color="green">
                    {intl.formatMessage({
                      id: 'settings.developerPanel.success',
                    })}{' '}
                    {batch.success}
                  </Tag>
                  {batch.failed > 0 && (
                    <Tag color="red">
                      {intl.formatMessage({
                        id: 'settings.developerPanel.failed',
                      })}{' '}
                      {batch.failed}
                    </Tag>
                  )}
                </span>
              ),
              children:
                batch.tasks.length === 0 ? (
                  <Text type="secondary">
                    {intl.formatMessage({
                      id: 'settings.developerPanel.noTask',
                    })}
                  </Text>
                ) : (
                  batch.tasks.map((task) => (
                    <div key={task.id} className={styles.syncTaskRow}>
                      <div className={styles.syncTaskMain}>
                        <Text
                          className={styles.syncTaskSession}
                          ellipsis={{ tooltip: task.session_uuid }}
                        >
                          {task.session_uuid}
                        </Text>
                        {statusTag(task)}
                      </div>
                      <div className={styles.syncTaskMeta}>
                        <Text type="secondary">
                          {intl.formatMessage({
                            id: 'settings.developerPanel.newCount',
                          })}{' '}
                          {task.new_count}
                        </Text>
                        <Text type="secondary">
                          {intl.formatMessage({
                            id: 'settings.developerPanel.batches',
                          })}{' '}
                          {task.batches}
                        </Text>
                        {task.attempt > 1 && (
                          <Text type="secondary">
                            {intl.formatMessage({
                              id: 'settings.developerPanel.attempt',
                            })}{' '}
                            {task.attempt}
                          </Text>
                        )}
                      </div>
                      {task.status === STATUS_FAILED && task.last_error && (
                        <div className={styles.syncTaskError}>
                          <Text
                            type="danger"
                            ellipsis={{ tooltip: task.last_error }}
                          >
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

const LogView = () => {
  const intl = useIntl();
  const [data, setData] = useState<AppLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const load = async (p = page, lv = level) => {
    setLoading(true);
    try {
      const res = await invoke<LogPage>('get_app_logs', {
        level: lv ?? null,
        page: p,
        size,
      });
      setData(res.list);
      setTotal(res.total);
    } catch (error) {
      console.error('获取日志失败:', error);
      message.error(
        intl.formatMessage({ id: 'settings.developerPanel.logLoadFailed' }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLevelChange = (value: number | undefined) => {
    setLevel(value);
    setPage(1);
    load(1, value);
  };

  const onClear = () => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'settings.developerPanel.logClear' }),
      content: intl.formatMessage({
        id: 'settings.developerPanel.logClearConfirm',
      }),
      okText: intl.formatMessage({ id: 'settings.developerPanel.logClear' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const n = await invoke<number>('clear_app_logs');
        message.success(
          intl.formatMessage(
            { id: 'settings.developerPanel.logClearSuccess' },
            { count: n },
          ),
        );
        setPage(1);
        load(1, level);
      },
    });
  };

  const columns: ColumnsType<AppLog> = [
    {
      title: intl.formatMessage({ id: 'settings.developerPanel.logTime' }),
      dataIndex: 'created_at',
      width: 170,
      render: (v: number) => <Text type="secondary">{formatTime(v)}</Text>,
    },
    {
      title: intl.formatMessage({ id: 'settings.developerPanel.logLevel' }),
      dataIndex: 'level',
      width: 90,
      render: (v: number) => <Tag color={levelColor(v)}>{levelText(v)}</Tag>,
    },
    {
      title: intl.formatMessage({ id: 'settings.developerPanel.logSource' }),
      dataIndex: 'source',
      width: 140,
      render: (v: string) => (
        <Text className={styles.syncTaskSession}>{v || '-'}</Text>
      ),
    },
    {
      title: intl.formatMessage({ id: 'settings.developerPanel.logRemote' }),
      dataIndex: 'remote_addr',
      width: 150,
      render: (v: string) => <Text type="secondary">{v || '-'}</Text>,
    },
    {
      title: intl.formatMessage({ id: 'settings.developerPanel.logRaw' }),
      dataIndex: 'raw',
      ellipsis: true,
      render: (v: string) => <Text ellipsis={{ tooltip: v }}>{v}</Text>,
    },
    {
      title: intl.formatMessage({ id: 'settings.developerPanel.logDetail' }),
      dataIndex: 'detail',
      width: 180,
      ellipsis: true,
      render: (v: string) =>
        v ? (
          <Text type="secondary" ellipsis={{ tooltip: v }}>
            {v}
          </Text>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <div className={styles.syncToolbar}>
        <Space>
          <Button
            type="primary"
            size="small"
            loading={loading}
            onClick={() => load(page, level)}
          >
            {intl.formatMessage({ id: 'settings.developerPanel.refresh' })}
          </Button>
          <Select
            size="small"
            style={{ width: 120 }}
            value={level}
            placeholder={intl.formatMessage({
              id: 'settings.developerPanel.logLevelAll',
            })}
            allowClear
            onChange={onLevelChange}
            options={[
              { value: LOG_LEVEL_INFO, label: 'INFO' },
              { value: LOG_LEVEL_WARN, label: 'WARN' },
              { value: LOG_LEVEL_ERROR, label: 'ERROR' },
            ]}
          />
          <Button size="small" danger loading={loading} onClick={onClear}>
            {intl.formatMessage({ id: 'settings.developerPanel.logClear' })}
          </Button>
        </Space>
      </div>
      <Table<AppLog>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={data}
        loading={loading}
        locale={{
          emptyText: (
            <Empty
              description={intl.formatMessage({
                id: 'settings.developerPanel.logEmpty',
              })}
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (t) =>
            intl.formatMessage(
              { id: 'settings.developerPanel.logTotal' },
              { total: t },
            ),
          onChange: (p, s) => {
            setPage(p);
            setSize(s);
            load(p, level);
          },
        }}
      />
    </div>
  );
};

const ClientLogView = () => {
  const intl = useIntl();
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [lines, setLines] = useState<string[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  const readFile = async (name: string) => {
    const data = await invoke<LogFileContent>('read_client_log_file', {
      fileName: name,
      maxLines: 500,
    });
    setLines(data.lines);
    setTotalLines(data.total_lines);
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      const list = (await invoke<LogFileInfo[]>('get_client_log_files')) || [];
      setFiles(list);
      const target =
        fileName && list.some((f) => f.name === fileName)
          ? fileName
          : list[0]?.name;
      setFileName(target);
      if (target) {
        await readFile(target);
      } else {
        setLines([]);
        setTotalLines(0);
      }
    } catch (error) {
      console.error('获取客户端日志文件失败:', error);
      message.error(
        intl.formatMessage({
          id: 'settings.developerPanel.clientLogLoadFailed',
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFileChange = async (name: string) => {
    setFileName(name);
    await readFile(name);
  };

  const filteredLines = lines.filter((line) => {
    if (level !== undefined && !line.includes(`[${levelText(level)}]`))
      return false;
    const kw = keyword.trim().toLowerCase();
    if (kw && !line.toLowerCase().includes(kw)) return false;
    return true;
  });

  return (
    <div>
      <div className={styles.syncToolbar}>
        <Space>
          <Button
            type="primary"
            size="small"
            loading={loading}
            onClick={loadFiles}
          >
            {intl.formatMessage({ id: 'settings.developerPanel.refresh' })}
          </Button>
          <Select
            size="small"
            style={{ width: 260 }}
            value={fileName}
            placeholder={intl.formatMessage({
              id: 'settings.developerPanel.clientLogSelect',
            })}
            loading={loading}
            onChange={onFileChange}
            options={files.map((f) => ({
              value: f.name,
              label: `${f.name} (${formatSize(f.size)})`,
            }))}
          />
          <Select
            size="small"
            style={{ width: 120 }}
            value={level}
            placeholder={intl.formatMessage({
              id: 'settings.developerPanel.logLevelAll',
            })}
            allowClear
            onChange={(v: number | undefined) => setLevel(v)}
            options={[
              { value: LOG_LEVEL_INFO, label: 'INFO' },
              { value: LOG_LEVEL_WARN, label: 'WARN' },
              { value: LOG_LEVEL_ERROR, label: 'ERROR' },
            ]}
          />
          <Input
            size="small"
            style={{ width: 180 }}
            allowClear
            placeholder={intl.formatMessage({
              id: 'settings.developerPanel.clientLogKeyword',
            })}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Space>
      </div>
      {lines.length === 0 && !loading ? (
        <Empty
          description={intl.formatMessage({
            id: 'settings.developerPanel.logEmpty',
          })}
        />
      ) : (
        <>
          <pre className={styles.logConsole}>{filteredLines.join('\n')}</pre>
          <Text type="secondary">
            {intl.formatMessage(
              { id: 'settings.developerPanel.clientLogLineCount' },
              {
                name: fileName ?? '-',
                total: totalLines,
                shown: filteredLines.length,
              },
            )}
          </Text>
        </>
      )}
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
              label: intl.formatMessage({
                id: 'settings.developerPanel.syncTab',
              }),
              children: <SyncTaskView />,
            },
            {
              key: 'log',
              label: intl.formatMessage({
                id: 'settings.developerPanel.logTab',
              }),
              children: <LogView />,
            },
            {
              key: 'clientLog',
              label: intl.formatMessage({
                id: 'settings.developerPanel.clientLogTab',
              }),
              children: <ClientLogView />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DeveloperPanel;
