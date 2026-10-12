import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import {
  AudioOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FolderOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { FileType, LocalFileVo } from '@workspace/types';
import {
  Button,
  Empty,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Text } = Typography;

const typeOptions = (intl: ReturnType<typeof useIntl>) => [
  { value: '', label: intl.formatMessage({ id: 'settings.fileManager.all' }) },
  { value: 'image', label: intl.formatMessage({ id: 'settings.fileManager.image' }) },
  { value: 'video', label: intl.formatMessage({ id: 'settings.fileManager.video' }) },
  { value: 'audio', label: intl.formatMessage({ id: 'settings.fileManager.audio' }) },
  { value: 'document', label: intl.formatMessage({ id: 'settings.fileManager.document' }) },
  { value: 'archive', label: intl.formatMessage({ id: 'settings.fileManager.archive' }) },
  { value: 'other', label: intl.formatMessage({ id: 'settings.fileManager.other' }) },
];

const typeColor: Record<string, string> = {
  image: 'geekblue',
  video: 'purple',
  audio: 'cyan',
  document: 'green',
  archive: 'orange',
  other: 'default',
};

const formatSize = (size: number): string => {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)}MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)}GB`;
};

const formatTime = (ms: number): string => {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
};

const FileManager = () => {
  const intl = useIntl();
  const [files, setFiles] = useState<LocalFileVo[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileType, setFileType] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const load = async (
    type = fileType,
    by = sortBy,
    order = sortOrder,
  ) => {
    setLoading(true);
    try {
      const result = await invoke<LocalFileVo[]>('get_local_file_list', {
        fileType: type || null,
        sortBy: by,
        sortOrder: order,
      });
      setFiles(result || []);
    } catch (error) {
      console.error('获取文件列表失败:', error);
      message.error(
        intl.formatMessage({ id: 'settings.fileManager.loadFailed' }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTypeChange = (v: string) => {
    setFileType(v);
    load(v, sortBy, sortOrder);
  };

  const onSortChange = (by: 'date' | 'name', order: 'desc' | 'asc') => {
    setSortBy(by);
    setSortOrder(order);
    load(fileType, by, order);
  };

  const onDelete = async (file: LocalFileVo) => {
    try {
      await invoke('delete_local_file', { id: file.id });
      message.success(
        intl.formatMessage({ id: 'settings.fileManager.deleteSuccess' }),
      );
      load();
    } catch (error) {
      console.error('删除文件失败:', error);
      message.error(
        intl.formatMessage({ id: 'settings.fileManager.deleteFailed' }),
      );
    }
  };

  const columns: ColumnsType<LocalFileVo> = [
    {
      title: intl.formatMessage({ id: 'settings.fileManager.name' }),
      dataIndex: 'file_name',
      ellipsis: true,
      render: (v: string, record) => (
        <Space size={10}>
          {record.file_type === 'image' ? (
            <img
              src={convertFileSrc(record.file_path)}
              alt={v}
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                objectFit: 'cover',
                flexShrink: 0,
                background: 'var(--color-gray-3)',
              }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: typeColorMap(record.file_type),
                background: 'var(--color-gray-3)',
                flexShrink: 0,
              }}
            >
              {typeIcon(record.file_type)}
            </div>
          )}
          <Text
            style={{ color: 'var(--text-primary)' }}
            ellipsis={{ tooltip: v }}
          >
            {v}
          </Text>
        </Space>
      ),
    },
    {
      title: intl.formatMessage({ id: 'settings.fileManager.type' }),
      dataIndex: 'file_type',
      width: 100,
      render: (v: FileType) => (
        <Tag color={typeColor[v]}>
          {intl.formatMessage({
            id: `settings.fileManager.${v}`,
          })}
        </Tag>
      ),
    },
    {
      title: intl.formatMessage({ id: 'settings.fileManager.size' }),
      dataIndex: 'file_size',
      width: 100,
      render: (v: number) => <Text type="secondary">{formatSize(v)}</Text>,
    },
    {
      title: intl.formatMessage({ id: 'settings.fileManager.createdAt' }),
      dataIndex: 'created_at',
      width: 170,
      render: (v: number) => <Text type="secondary">{formatTime(v)}</Text>,
    },
    {
      title: intl.formatMessage({ id: 'settings.fileManager.action' }),
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title={intl.formatMessage({ id: 'settings.fileManager.deleteConfirm' })}
          okText={intl.formatMessage({ id: 'settings.fileManager.delete' })}
          okButtonProps={{ danger: true }}
          cancelText={intl.formatMessage({ id: 'settings.fileManager.cancel' })}
          onConfirm={() => onDelete(record)}
        >
          <Button size="small" danger>
            {intl.formatMessage({ id: 'settings.fileManager.delete' })}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className={styles.settingSection}>
      <Typography.Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.fileManager.title' })}
      </Typography.Title>
      <div className={styles.syncToolbar}>
        <Space wrap>
          <Button
            type="primary"
            size="small"
            loading={loading}
            onClick={() => load()}
          >
            {intl.formatMessage({ id: 'settings.fileManager.refresh' })}
          </Button>
          <Select
            size="small"
            style={{ width: 120 }}
            value={fileType}
            onChange={onTypeChange}
            options={typeOptions(intl)}
          />
          <Select
            size="small"
            style={{ width: 120 }}
            value={sortBy}
            onChange={(v) => onSortChange(v, sortOrder)}
            options={[
              {
                value: 'date',
                label: intl.formatMessage({
                  id: 'settings.fileManager.sortByDate',
                }),
              },
              {
                value: 'name',
                label: intl.formatMessage({
                  id: 'settings.fileManager.sortByName',
                }),
              },
            ]}
          />
          <Select
            size="small"
            style={{ width: 110 }}
            value={sortOrder}
            onChange={(v) => onSortChange(sortBy, v)}
            options={[
              {
                value: 'desc',
                label: intl.formatMessage({ id: 'settings.fileManager.desc' }),
              },
              {
                value: 'asc',
                label: intl.formatMessage({ id: 'settings.fileManager.asc' }),
              },
            ]}
          />
        </Space>
      </div>
      <Table<LocalFileVo>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={files}
        loading={loading}
        locale={{
          emptyText: (
            <Empty
              description={intl.formatMessage({
                id: 'settings.fileManager.empty',
              })}
            />
          ),
        }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (t) =>
            intl.formatMessage(
              { id: 'settings.fileManager.total' },
              { total: t },
            ),
        }}
      />
    </div>
  );
};

const typeColorMap = (type: string): string => {
  switch (type) {
    case 'video':
      return '#722ed1';
    case 'audio':
      return '#13c2c2';
    case 'document':
      return '#52c41a';
    case 'archive':
      return '#fa8c16';
    default:
      return '#8c8c8c';
  }
};

const typeIcon = (type: string) => {
  switch (type) {
    case 'video':
      return <VideoCameraOutlined />;
    case 'audio':
      return <AudioOutlined />;
    case 'document':
      return <FileTextOutlined />;
    case 'archive':
      return <FileZipOutlined />;
    case 'image':
      return <FileImageOutlined />;
    default:
      return <FolderOutlined />;
  }
};

export default FileManager;