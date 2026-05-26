import { useState, useEffect } from 'react';
import { GroupVo } from '@workspace/types';
import { create_group } from '@workspace/services';
import { Modal, Input, InputNumber, message } from 'antd';

interface CreateGroupModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: (group: GroupVo) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  visible,
  onCancel,
  onSuccess,
}) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [maxMembers, setMaxMembers] = useState(500);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setGroupName('');
      setDescription('');
      setMaxMembers(500);
    }
  }, [visible]);

  const handleCreate = async () => {
    if (!groupName.trim()) {
      message.warning('请输入群名称');
      return;
    }
    setLoading(true);
    try {
      const group: GroupVo = await create_group({
        group_name: groupName.trim(),
        avatar: '',
        description: description.trim() || undefined,
        max_members: maxMembers,
      });
      message.success('群聊创建成功');
      onSuccess(group);
    } catch (err) {
      console.error('创建群聊失败', err);
      message.error('创建群聊失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="创建群组"
      open={visible}
      onOk={handleCreate}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
    >
      <div style={{ marginBottom: 16 }}>
        <label>群名称 <span style={{ color: 'red' }}>*</span></label>
        <Input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="请输入群名称（1-100字）"
          maxLength={100}
          showCount
          style={{ marginTop: 8 }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>群描述</label>
        <Input.TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="请输入群描述（选填，最多500字）"
          maxLength={500}
          showCount
          rows={3}
          style={{ marginTop: 8 }}
        />
      </div>
      <div>
        <label>最大成员数</label>
        <InputNumber
          value={maxMembers}
          onChange={(val) => setMaxMembers(val || 500)}
          min={1}
          max={9999}
          style={{ width: '100%', marginTop: 8 }}
        />
      </div>
    </Modal>
  );
};

export default CreateGroupModal;
