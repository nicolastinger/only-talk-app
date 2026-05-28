import { DEFAULT_ICON } from '@/constants';
import { GroupVo } from '@workspace/types';
import { update_group } from '@workspace/services';
import { Avatar, Button, Form, Input, message, Upload } from 'antd';
import { UserOutlined, CameraOutlined } from '@ant-design/icons';
import { useState } from 'react';
import styles from './index.module.less';

interface Props {
  groupInfo: GroupVo;
  onUpdate: () => void;
}

const BasicSettings: React.FC<Props> = ({ groupInfo, onUpdate }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

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
        <Upload
          showUploadList={false}
          accept="image/*"
          onChange={async (info) => {
            const file = info.file?.originFileObj;
            if (!file) return;
            // TODO: 上传图片获取URL后调用 update_group 更新 avatar
            message.info('上传头像功能待实现');
          }}
        >
          <div className={styles.avatarWrapper}>
            <img
              className={styles.avatar}
              src={groupInfo.avatar || DEFAULT_ICON}
              alt="group avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
            <div className={styles.avatarOverlay}>
              <CameraOutlined style={{ fontSize: 20 }} />
            </div>
          </div>
        </Upload>
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
