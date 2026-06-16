import { useState, useEffect } from 'react';
import { GroupVo } from '@workspace/types';
import { create_group } from '@workspace/services';
import { Modal, Input, InputNumber, message } from 'antd';
import { useIntl } from '@umijs/max';

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
  const intl = useIntl();
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
      message.warning(intl.formatMessage({ id: 'contacts.createGroup.nameRequired' }));
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
      message.success(intl.formatMessage({ id: 'contacts.createGroup.success' }));
      onSuccess(group);
    } catch (err) {
      console.error('创建群聊失败', err);
      message.error(intl.formatMessage({ id: 'contacts.createGroup.failed' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={intl.formatMessage({ id: 'contacts.createGroup.title' })}
      open={visible}
      onOk={handleCreate}
      onCancel={onCancel}
      confirmLoading={loading}
      okText={intl.formatMessage({ id: 'contacts.createGroup.create' })}
      cancelText={intl.formatMessage({ id: 'contacts.createGroup.cancel' })}
    >
      <div style={{ marginBottom: 16 }}>
        <label>{intl.formatMessage({ id: 'contacts.createGroup.nameLabel' })} <span style={{ color: 'red' }}>*</span></label>
        <Input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder={intl.formatMessage({ id: 'contacts.createGroup.namePlaceholder' })}
          maxLength={100}
          showCount
          style={{ marginTop: 8 }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>{intl.formatMessage({ id: 'contacts.createGroup.descLabel' })}</label>
        <Input.TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={intl.formatMessage({ id: 'contacts.createGroup.descPlaceholder' })}
          maxLength={500}
          showCount
          rows={3}
          style={{ marginTop: 8 }}
        />
      </div>
      <div>
        <label>{intl.formatMessage({ id: 'contacts.createGroup.maxMembersLabel' })}</label>
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
