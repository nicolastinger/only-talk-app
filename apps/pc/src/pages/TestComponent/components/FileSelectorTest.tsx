import React, { useState } from 'react';
import { Button, Card, Space, Typography, List, Tag } from 'antd';
import { selectFile } from '@/services/fileService';

const { Title, Text } = Typography;

const FileSelectorTest: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSingleSelect = async () => {
    setLoading(true);
    try {
      const files = await selectFile(false);
      if (files) {
        setSelectedFiles(files);
      }
    } catch (error) {
      console.error('单选文件失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMultiSelect = async () => {
    setLoading(true);
    try {
      const files = await selectFile(true);
      if (files) {
        setSelectedFiles(files);
      }
    } catch (error) {
      console.error('多选文件失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedFiles([]);
  };

  return (
    <Card title="文件选择器测试" bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={4}>操作</Title>
          <Space>
            <Button type="primary" onClick={handleSingleSelect} loading={loading}>
              单选文件
            </Button>
            <Button onClick={handleMultiSelect} loading={loading}>
              多选文件
            </Button>
            <Button onClick={handleClear} disabled={selectedFiles.length === 0}>
              清空
            </Button>
          </Space>
        </div>

        <div>
          <Title level={4}>选择结果</Title>
          {selectedFiles.length === 0 ? (
            <Text type="secondary">未选择任何文件</Text>
          ) : (
            <List
              bordered
              dataSource={selectedFiles}
              renderItem={(file, index) => (
                <List.Item>
                  <Space>
                    <Tag color="blue">{index + 1}</Tag>
                    <Text code>{file}</Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </div>

        <div>
          <Title level={4}>统计信息</Title>
          <Space>
            <Text>已选择文件数量: <Tag color="green">{selectedFiles.length}</Tag></Text>
          </Space>
        </div>
      </Space>
    </Card>
  );
};

export default FileSelectorTest;
