import { DEFAULT_ICON, TALK_API } from '@/constants';
import { GroupVo } from '@workspace/types';
import { update_group } from '@workspace/services';
import { convertPathToTauriUrl, getFiles, selectFile } from '@workspace/services';
import { Avatar, Button, Form, Input, message, Spin } from 'antd';
import { UserOutlined, CameraOutlined, LoadingOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import styles from './index.module.less';

interface Props {
  groupInfo: GroupVo;
  onUpdate: () => void;
}

const BasicSettings: React.FC<Props> = ({ groupInfo, onUpdate }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const handleAvatarUpload = async () => {
    if (avatarUploading) return;
    try {
      const files = await selectFile(false);
      if (!files || files.length === 0) return;

      const filePath = files[0];
      setAvatarUploading(true);

      const compressedResult = await invoke<string>('compress_image_to_webp_command', {
        inputPath: filePath,
      });

      const preview = convertPathToTauriUrl(compressedResult);
      if (preview) {
        setAvatarUrl(preview);
      }

      const uploadResult = await invoke<{ status: number; body: string }>('upload_file_request', {
        url: `${TALK_API}/file_integrated/upload/group_avatar/${groupInfo.group_uuid}`,
        filePath: compressedResult,
        fieldName: 'file',
      });

      if (uploadResult.status === 200) {
        const responseBody = JSON.parse(uploadResult.body);
        if (responseBody.code === 200 && responseBody.data) {
          const bizId = responseBody.data;
          const FileVos = await getFiles(bizId);
          const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

          if (tauriFilePath) {
            setAvatarUrl(tauriFilePath);
            message.success('群头像更新成功');
            onUpdate();
          } else {
            message.error('获取群头像文件失败');
          }
        } else {
          message.error(responseBody.msg || '群头像上传失败');
        }
      } else {
        message.error('群头像上传失败');
      }
    } catch (error: any) {
      console.error('群头像更新失败:', error);
      message.error(error.message || '群头像更新失败');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async (values: { group_name: string; description: string }) => {
    setSaving(true);
    try {
      await update_group({
        group_uuid: groupInfo.group_uuid,
        group_name: values.group_name,
        description: values.description,
      });
      message.success('保存成功');
      onUpdate();
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={styles.avatarSection}>
        <div
          className={styles.avatarWrapper}
          onClick={handleAvatarUpload}
          style={{ cursor: 'pointer' }}
        >
          <Spin
            indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
            spinning={avatarUploading}
          >
            <img
              className={styles.avatar}
              src={avatarUrl || groupInfo.avatar || DEFAULT_ICON}
              alt="group avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
          </Spin>
          {!avatarUploading && (
            <div className={styles.avatarOverlay}>
              <CameraOutlined style={{ fontSize: 20, color: '#fff' }} />
            </div>
          )}
        </div>
        <span className={styles.avatarHint}>点击更换头像</span>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          group_name: groupInfo.group_name,
          description: groupInfo.description || '',
        }}
        onFinish={handleSave}
      >
        <div className={styles.formSection}>
          <label className={styles.formLabel}>群名称</label>
          <Form.Item
            name="group_name"
            rules={[
              { required: true, message: '请输入群名称' },
              { max: 50, message: '群名称不能超过50个字符' },
            ]}
          >
            <Input placeholder="请输入群名称" />
          </Form.Item>
        </div>

        <div className={styles.formSection}>
          <label className={styles.formLabel}>群简介</label>
          <Form.Item name="description">
            <Input.TextArea
              rows={4}
              placeholder="请输入群简介（选填）"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </div>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存修改
          </Button>
        </Form.Item>
      </Form>

      <div style={{ marginTop: 24, color: 'var(--color-gray-text)', fontSize: 12 }}>
        <div>群ID: {groupInfo.group_uuid}</div>
        <div>
          创建时间:{' '}
          {groupInfo.created_at ? new Date(groupInfo.created_at).toLocaleDateString('zh-CN') : '-'}
        </div>
      </div>
    </div>
  );
};

export default BasicSettings;
